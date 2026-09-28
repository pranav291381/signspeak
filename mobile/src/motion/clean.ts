import { POSE_LEFT_WRIST_Y, POSE_RIGHT_WRIST_Y, signing } from '@/recognition/features';
import {
  COORDS,
  FRAME_DIM,
  HAND_LANDMARK_COUNT,
  LEFT_HAND_PRESENT_INDEX,
  LEFT_HAND_START,
  POSE_PRESENT_INDEX,
  POSE_START,
  RIGHT_HAND_PRESENT_INDEX,
  RIGHT_HAND_START,
} from '@/recognition/featureSpec';

/**
 * Tidies a recorded sign for display (not for recognition): fills short gaps
 * where the hand tracker lost a hand, smooths tracking jitter and trims the
 * rest before and after the sign.
 *
 * A lost hand is placed where the pose tracker still saw its wrist, with its
 * shape blended between the frames before and after the gap. Nothing is added
 * where neither tracker saw the hand.
 */

const HAND_VALUES = HAND_LANDMARK_COUNT * COORDS;
const POSE_VALUES = LEFT_HAND_START - POSE_START;

interface HandSlots {
  start: number;
  present: number;
  /** x of the pose tracker's wrist for this hand. */
  poseWrist: number;
}

const HANDS: readonly HandSlots[] = [
  { start: LEFT_HAND_START, present: LEFT_HAND_PRESENT_INDEX, poseWrist: POSE_LEFT_WRIST_Y - 1 },
  { start: RIGHT_HAND_START, present: RIGHT_HAND_PRESENT_INDEX, poseWrist: POSE_RIGHT_WRIST_Y - 1 },
];

export interface CleanOptions {
  /** Longest run of lost frames (hand or body) filled between two seen ones. */
  maxGap?: number;
  /** Frames a hand is carried past where it was last (or first) seen, following the wrist. */
  maxEdge?: number;
}

const DEFAULT_MAX_GAP = 10;
const DEFAULT_MAX_EDGE = 6;

const hasPose = (frame: Float32Array) => (frame[POSE_PRESENT_INDEX] ?? 0) > 0.5;
const hasHand = (frame: Float32Array, hand: HandSlots) => (frame[hand.present] ?? 0) > 0.5;

function copyFrames(frames: readonly (ArrayLike<number> | null)[]): Float32Array[] {
  return frames.map((values) => {
    const out = new Float32Array(FRAME_DIM);
    if (values && values.length === FRAME_DIM) out.set(Array.from(values));
    return out;
  });
}

/** Nearest index before / after `t` where `seen` holds. */
function neighbours(seen: readonly boolean[], t: number): [number | null, number | null] {
  let before: number | null = null;
  let after: number | null = null;
  for (let i = t - 1; i >= 0; i--) {
    if (seen[i]) {
      before = i;
      break;
    }
  }
  for (let i = t + 1; i < seen.length; i++) {
    if (seen[i]) {
      after = i;
      break;
    }
  }
  return [before, after];
}

function fillPose(frames: Float32Array[], maxGap: number): void {
  const seen = frames.map(hasPose);
  frames.forEach((frame, t) => {
    if (seen[t]) return;
    const [a, b] = neighbours(seen, t);
    if (a === null || b === null || b - a - 1 > maxGap) return;
    const s = (t - a) / (b - a);
    for (let i = POSE_START; i < POSE_START + POSE_VALUES; i++) frame[i] = frames[a]![i]! + (frames[b]![i]! - frames[a]![i]!) * s;
    frame[POSE_PRESENT_INDEX] = 1;
  });
}

/** Hand at `t`: the shape of `a` and `b` blended by `s`, its wrist at the pose wrist plus the blended offset. */
function placeHand(frames: Float32Array[], hand: HandSlots, t: number, a: number, b: number, s: number): void {
  const out = frames[t]!;
  const fa = frames[a]!;
  const fb = frames[b]!;
  for (let c = 0; c < COORDS; c++) {
    const wristA = fa[hand.start + c]!;
    const wristB = fb[hand.start + c]!;
    // Depth of the pose wrist is on another scale: blend the hand's own depth.
    const anchor =
      c < 2
        ? out[hand.poseWrist + c]! +
          (wristA - fa[hand.poseWrist + c]!) * (1 - s) +
          (wristB - fb[hand.poseWrist + c]!) * s
        : wristA * (1 - s) + wristB * s;
    for (let k = 0; k < HAND_LANDMARK_COUNT; k++) {
      const i = hand.start + k * COORDS + c;
      out[i] = anchor + (fa[i]! - wristA) * (1 - s) + (fb[i]! - wristB) * s;
    }
  }
  out[hand.present] = 1;
}

function fillHand(frames: Float32Array[], hand: HandSlots, maxGap: number, maxEdge: number): void {
  const seen = frames.map((frame) => hasHand(frame, hand));
  frames.forEach((frame, t) => {
    if (seen[t] || !hasPose(frame)) return;
    const [a, b] = neighbours(seen, t);
    if (a !== null && b !== null && b - a - 1 <= maxGap) placeHand(frames, hand, t, a, b, (t - a) / (b - a));
    else if (a !== null && t - a <= maxEdge) placeHand(frames, hand, t, a, a, 0);
    else if (b !== null && b - t <= maxEdge) placeHand(frames, hand, t, b, b, 0);
  });
}

/** Fills short tracking gaps (see the module comment). Returns new frames. */
export function fillGaps(frames: readonly (ArrayLike<number> | null)[], options: CleanOptions = {}): Float32Array[] {
  const maxGap = options.maxGap ?? DEFAULT_MAX_GAP;
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const out = copyFrames(frames);
  fillPose(out, maxGap);
  // Hands are placed relative to the pose wrists, so decide from the originals which frames had a hand.
  for (const hand of HANDS) fillHand(out, hand, maxGap, maxEdge);
  return out;
}

const POSE_WEIGHTS = [1, 2, 3, 2, 1];
const HAND_WEIGHTS = [1, 2, 1];

function smoothBlock(
  source: readonly Float32Array[],
  out: Float32Array[],
  start: number,
  length: number,
  present: (frame: Float32Array) => boolean,
  weights: readonly number[],
): void {
  const half = (weights.length - 1) / 2;
  source.forEach((frame, t) => {
    if (!present(frame)) return;
    for (let i = start; i < start + length; i++) {
      let sum = 0;
      let total = 0;
      weights.forEach((w, k) => {
        const other = source[t + k - half];
        if (!other || !present(other)) return;
        sum += other[i]! * w;
        total += w;
      });
      out[t]![i] = sum / total;
    }
  });
}

/** Light temporal smoothing of every landmark (tracking jitter), where it was seen. */
export function smoothFrames(frames: readonly Float32Array[]): Float32Array[] {
  const out = frames.map((frame) => Float32Array.from(frame));
  smoothBlock(frames, out, POSE_START, POSE_VALUES, hasPose, POSE_WEIGHTS);
  for (const hand of HANDS) smoothBlock(frames, out, hand.start, HAND_VALUES, (f) => hasHand(f, hand), HAND_WEIGHTS);
  return out;
}

/** First and last frame of signing (a hand or wrist raised), or null when there is none. */
export function signingSpan(frames: readonly (ArrayLike<number> | null)[]): [number, number] | null {
  let first = -1;
  let last = -1;
  frames.forEach((frame, i) => {
    if (!signing(frame)) return;
    if (first < 0) first = i;
    last = i;
  });
  return first < 0 ? null : [first, last];
}

/** Keeps the signing and `margin` frames either side of it. */
export function trimToSigning<T extends ArrayLike<number> | null>(frames: readonly T[], margin: number): T[] {
  const span = signingSpan(frames);
  if (!span) return [...frames];
  return frames.slice(Math.max(0, span[0] - margin), Math.min(frames.length, span[1] + margin + 1));
}

/** The whole tidy-up: fill gaps, smooth, trim. */
export function cleanRecording(frames: readonly (ArrayLike<number> | null)[], margin = 4, options: CleanOptions = {}): Float32Array[] {
  return trimToSigning(smoothFrames(fillGaps(frames, options)), margin);
}
