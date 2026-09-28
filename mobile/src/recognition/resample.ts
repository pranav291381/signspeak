import {
  FRAME_DIM,
  LEFT_HAND_PRESENT_INDEX,
  LEFT_HAND_START,
  POSE_PRESENT_INDEX,
  POSE_START,
  RIGHT_HAND_PRESENT_INDEX,
  RIGHT_HAND_START,
  TARGET_FPS,
} from './featureSpec';
import type { LandmarkFrame } from './types';

/** Parts of a frame that are present or absent together: [start, end, presence flag]. */
const PARTS: readonly [number, number, number][] = [
  [POSE_START, LEFT_HAND_START, POSE_PRESENT_INDEX],
  [LEFT_HAND_START, RIGHT_HAND_START, LEFT_HAND_PRESENT_INDEX],
  [RIGHT_HAND_START, POSE_PRESENT_INDEX, RIGHT_HAND_PRESENT_INDEX],
];

/**
 * A frame `w` of the way from `a` to `b`: parts present in both are
 * interpolated; otherwise each part comes from the nearer frame.
 */
export function blendFrames(a: Float32Array | null, b: Float32Array | null, w: number): Float32Array | null {
  const nearer = w < 0.5 ? a : b;
  if (!a || !b || a.length !== FRAME_DIM || b.length !== FRAME_DIM) return nearer ? Float32Array.from(nearer) : null;
  const out = Float32Array.from(nearer!);
  for (const [start, end, flag] of PARTS) {
    if ((a[flag] ?? 0) > 0.5 && (b[flag] ?? 0) > 0.5) {
      for (let i = start; i < end; i++) out[i] = a[i]! + (b[i]! - a[i]!) * w;
      out[flag] = 1;
    }
  }
  return out;
}

/**
 * Turns frames arriving at any rate into a steady `fps` timeline, as the model
 * was trained on (15 frames a second). On a slow phone the engine may track
 * only a few frames a second; without this a window of 32 frames would span
 * many seconds and every sign would look several times slower than it is.
 * Missing frames between two tracked ones are interpolated; gaps longer than
 * `maxGapMs` (paused, app in background) are not filled.
 */
export class FrameResampler {
  private last: LandmarkFrame | null = null;

  constructor(
    private readonly fps = TARGET_FPS,
    private readonly maxGapMs = 1000,
  ) {}

  /** The frames to hand on for a newly tracked frame (oldest first). */
  push(frame: LandmarkFrame): LandmarkFrame[] {
    const previous = this.last;
    this.last = frame;
    const gap = previous ? frame.timestampMs - previous.timestampMs : 0;
    if (!previous || gap <= 0 || gap > this.maxGapMs) return [frame];
    const slots = Math.max(1, Math.round(gap / (1000 / this.fps)));
    const out: LandmarkFrame[] = [];
    for (let k = 1; k < slots; k++) {
      const w = k / slots;
      out.push({ timestampMs: previous.timestampMs + gap * w, values: blendFrames(previous.values, frame.values, w) });
    }
    out.push(frame);
    return out;
  }

  reset(): void {
    this.last = null;
  }
}
