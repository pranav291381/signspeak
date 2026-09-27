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
export function frameValues(pose: Point3[] | undefined, hands: HandsResultLike): { values: number[] | null; hands: number } {
  const { left, right, count } = pickHands(hands);
  if (!pose) return { values: null, hands: count };
  const vector = normalizeFrame(pose, left, right);
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
