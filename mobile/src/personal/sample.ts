import { FRAME_DIM } from '@/recognition/featureSpec';
import { handsRaised, handsVisible, signerPresent } from '@/recognition/features';
import type { LandmarkFrame } from '@/recognition/types';

/**
 * Frames per second of stored samples and of the live query. Resampling both
 * to one rate makes matching independent of how fast a phone can track.
 */
export const SAMPLE_FPS = 15;
/** Shortest usable recording: frames in which hands were visible. */
export const MIN_HAND_FRAMES = 6;
/** Longest sample kept (ms). */
export const MAX_SAMPLE_MS = 4000;
/** A gap longer than this between tracked frames counts as "nothing seen". */
const MAX_GAP_MS = 250;

/**
 * Nearest-frame resampling at a fixed rate between `startMs` and `endMs`.
 * Frames without usable values (or too far from any frame) become null.
 */
export function resampleByTime(
  frames: readonly LandmarkFrame[],
  startMs: number,
  endMs: number,
  fps = SAMPLE_FPS,
): (Float32Array | null)[] {
  const out: (Float32Array | null)[] = [];
  if (frames.length === 0 || endMs < startMs) return out;
  const step = 1000 / fps;
  let j = 0;
  for (let t = startMs; t <= endMs + 1e-6; t += step) {
    while (j + 1 < frames.length && Math.abs(frames[j + 1]!.timestampMs - t) <= Math.abs(frames[j]!.timestampMs - t)) {
      j += 1;
    }
    const nearest = frames[j]!;
    out.push(Math.abs(nearest.timestampMs - t) <= MAX_GAP_MS ? nearest.values : null);
  }
  return out;
}

/**
 * Index range [first, last] of frames with a hand raised into signing space, or
 * null. Hands resting low before and after a sign are not part of it.
 */
export function handSpan(frames: readonly (ArrayLike<number> | null)[]): [number, number] | null {
  let first = -1;
  let last = -1;
  frames.forEach((values, i) => {
    if (handsRaised(values)) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return first < 0 ? null : [first, last];
}

export type SampleProblem = 'no_signer' | 'no_hands' | 'too_short';

export type PreparedSample = { ok: true; frames: Float32Array[] } | { ok: false; problem: SampleProblem };

/**
 * Turns raw recorded frames into a stored sample: resampled to SAMPLE_FPS and
 * trimmed to the part where hands are raised. Explains what went wrong otherwise,
 * so the teach flow can tell the user how to fix it.
 */
export function prepareSample(recorded: readonly LandmarkFrame[]): PreparedSample {
  const tracked = recorded.filter((f) => f.values !== null && f.values.length === FRAME_DIM);
  if (tracked.filter((f) => signerPresent(f.values)).length < MIN_HAND_FRAMES) {
    return { ok: false, problem: 'no_signer' };
  }
  // Hands resting low (on the lap) are not signing.
  const withHands = tracked.filter((f) => handsRaised(f.values));
  if (withHands.length === 0) return { ok: false, problem: 'no_hands' };

  const start = withHands[0]!.timestampMs;
  const end = Math.min(withHands.at(-1)!.timestampMs, start + MAX_SAMPLE_MS);
  const resampled = resampleByTime(tracked, start, end);
  const handFrames = resampled.filter((values) => handsVisible(values)).length;
  if (handFrames < MIN_HAND_FRAMES) return { ok: false, problem: 'too_short' };

  // Keep every step (so timing is preserved); fill brief tracking drop-outs with the previous frame.
  const frames: Float32Array[] = [];
  let previous: Float32Array | null = null;
  for (const values of resampled) {
    const frame: Float32Array | null = values ?? previous;
    if (frame) {
      frames.push(frame);
      previous = frame;
    }
  }
  return { ok: true, frames };
}
