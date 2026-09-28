/**
 * Pure helpers used by the landmark engine page. Kept free of DOM access so
 * they can be unit-tested with Jest (engine/__tests__/core.test.ts).
 */
import { normalizeFrame, type Point3 } from '../src/recognition/features';
import type { EngineErrorCode } from '../src/engine/protocol';

export interface HandsResultLike {
  landmarks: Point3[][];
  handedness: { categoryName: string; score: number }[][];
}

/**
 * Assign detected hands to left/right using MediaPipe's handedness label on
 * unmirrored frames (feature spec v1). If two hands get the same label, the
 * more confident one wins, as in the Python extractor.
 */
export function pickHands(result: HandsResultLike): { left: Point3[] | null; right: Point3[] | null; count: number } {
  const best: Record<'left' | 'right', { score: number; points: Point3[] } | undefined> = { left: undefined, right: undefined };
  result.landmarks.forEach((points, i) => {
    const category = result.handedness[i]?.[0];
    const name = category?.categoryName.toLowerCase();
    if (name !== 'left' && name !== 'right') return;
    if (!best[name] || (category?.score ?? 0) > (best[name]?.score ?? 0)) {
      best[name] = { score: category?.score ?? 0, points };
    }
  });
  return { left: best.left?.points ?? null, right: best.right?.points ?? null, count: result.landmarks.length };
}

/** Feature vector for one frame, or null when no usable person was found. */
/**
 * MediaPipe's normalized coordinates divide x by the image width and y by its
 * height, so vertical distances would depend on the camera's shape (a portrait
 * phone and a landscape video differ about 3×). Rescaling y by height / width
 * makes both axes image-width units before body-centred normalization.
 */
export function isotropic(points: readonly Point3[], heightOverWidth: number): Point3[] {
  return points.map((p) => ({ x: p.x, y: p.y * heightOverWidth, z: p.z }));
}

/**
 * One feature-spec frame from MediaPipe results.
 * @param heightOverWidth the analysed image's height / width (see isotropic).
 */
export function frameValues(
  pose: Point3[] | undefined,
  hands: HandsResultLike,
  heightOverWidth: number,
): { values: number[] | null; hands: number } {
  const { left, right, count } = pickHands(hands);
  if (!pose) return { values: null, hands: count };
  const ratio = Number.isFinite(heightOverWidth) && heightOverWidth > 0 ? heightOverWidth : 1;
  const vector = normalizeFrame(
    isotropic(pose, ratio),
    left && isotropic(left, ratio),
    right && isotropic(right, ratio),
  );
  // normalizeFrame returns all zeros for a degenerate pose: treat as nobody in view.
  if (vector[153] !== 1) return { values: null, hands: count };
  // 4 decimals keeps messages small; far below landmark noise.
  return { values: Array.from(vector, (v) => Math.round(v * 1e4) / 1e4), hands: count };
}

/** Map getUserMedia failures to user-facing states. */
export function cameraErrorCode(error: unknown): EngineErrorCode {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'camera_denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'no_camera';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'camera_in_use';
  return 'no_camera';
}

export function wasmFiles(simd: boolean): { loader: string; binary: string } {
  const stem = simd ? 'vision_wasm_internal' : 'vision_wasm_nosimd_internal';
  return { loader: `${stem}.js`, binary: `${stem}.wasm` };
}

/** Rolling frames-per-second and inference time. */
export class FrameMeter {
  private times: number[] = [];
  private inference: number[] = [];

  record(now: number, inferenceMs: number): void {
    this.times.push(now);
    this.inference.push(inferenceMs);
    while (this.times.length > 30) {
      this.times.shift();
      this.inference.shift();
    }
  }

  get fps(): number {
    if (this.times.length < 2) return 0;
    const span = (this.times[this.times.length - 1]! - this.times[0]!) / 1000;
    return span > 0 ? (this.times.length - 1) / span : 0;
  }

  get inferenceMs(): number {
    return this.inference.length ? this.inference.reduce((a, b) => a + b, 0) / this.inference.length : 0;
  }
}

export type Delegate = 'GPU' | 'CPU';

/**
 * WebGL renderers that run on the CPU (Chrome's fallback when the GPU is
 * blocked or hardware acceleration is off, Mesa's llvmpipe, Windows' basic
 * display driver). MediaPipe's GPU path on them is many times slower than its
 * WASM CPU path.
 */
export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  // Unknown (some phone WebViews hide the name): try the GPU; the tuner measures it.
  if (!renderer) return false;
  return /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(renderer);
}

/** Delegates to try, fastest-likely first. */
export function delegateOrder(softwareRenderer: boolean): Delegate[] {
  return softwareRenderer ? ['CPU'] : ['GPU', 'CPU'];
}

/**
 * Chooses between GPU and CPU by measuring. Starts on the first delegate; if
 * it is slow, tries the other once and keeps whichever was faster.
 */
export class DelegateTuner {
  /** Detections measured before deciding. */
  static readonly SAMPLE = 20;
  /** Below this average inference time a delegate is fast enough to keep. */
  static readonly FAST_ENOUGH_MS = 45;

  private readonly measured = new Map<Delegate, number>();
  private samples: number[] = [];
  private decided = false;

  constructor(
    public current: Delegate,
    private readonly available: readonly Delegate[],
  ) {}

  /** Records one detection; returns a delegate to switch to, or null to stay. */
  record(inferenceMs: number): Delegate | null {
    if (this.decided) return null;
    this.samples.push(inferenceMs);
    if (this.samples.length < DelegateTuner.SAMPLE) return null;
    // Median: robust to a slow first frame (shader compilation) and GC pauses.
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this.measured.set(this.current, median);
    this.samples = [];

    const untried = this.available.find((d) => !this.measured.has(d));
    if (median > DelegateTuner.FAST_ENOUGH_MS && untried) {
      this.current = untried;
      return untried;
    }
    this.decided = true;
    let best = this.current;
    for (const [delegate, ms] of this.measured) if (ms < this.measured.get(best)!) best = delegate;
    if (best !== this.current) {
      this.current = best;
      return best;
    }
    return null;
  }

  get settled(): boolean {
    return this.decided;
  }

  /** What was measured, e.g. "GPU 62 ms, CPU 240 ms" (median per detection). */
  summary(): string {
    return [...this.measured].map(([delegate, ms]) => `${delegate} ${Math.round(ms)} ms`).join(', ');
  }
}

/**
 * Mirror the preview like a selfie? Phones report the camera's facing mode;
 * laptop webcams usually do not, and they face the user.
 */
export function shouldMirror(requested: 'front' | 'back', reported: string | undefined, webDesktopHint: boolean): boolean {
  if (reported === 'user') return true;
  if (reported === 'environment') return false;
  return requested === 'front' || webDesktopHint;
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * One smoothing step for drawing: moves `current` toward `target` by factor k
 * (0…1). Large jumps (a different hand, a re-detection) snap instead of
 * sweeping across the screen.
 */
export function smoothPoints(current: Pt[] | null, target: Pt[], k: number, snapDistance = 0.2): Pt[] {
  if (!current || current.length !== target.length) return target.map((p) => ({ x: p.x, y: p.y }));
  const dx = target[0]!.x - current[0]!.x;
  const dy = target[0]!.y - current[0]!.y;
  if (Math.hypot(dx, dy) > snapDistance) return target.map((p) => ({ x: p.x, y: p.y }));
  return current.map((p, i) => ({ x: p.x + (target[i]!.x - p.x) * k, y: p.y + (target[i]!.y - p.y) * k }));
}
