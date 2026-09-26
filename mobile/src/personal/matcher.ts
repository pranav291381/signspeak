import { handsVisible } from '@/recognition/features';

import { decodeFrames } from './codec';
import { compactFrame } from './compact';
import { subsequenceDtw } from './dtw';
import { handSpan } from './sample';
import { MIN_SAMPLES_FOR_RECOGNITION, type PersonalSign } from './types';

/**
 * Personal-sign matching: a query is compared with each recorded sample by
 * subsequence DTW over compact frames. Each sign gets its own acceptance
 * distance from how consistently it was recorded (leave-one-out), so a
 * carefully repeated sign is matched strictly and a naturally variable one
 * more loosely, within fixed bounds.
 */

/** Share of a sample trimmed from each end: raising/lowering the hands is not the sign. */
const CORE_TRIM = { letter: 0.25, other: 0.1 } as const;
/** Acceptance distance = clamp(SPREAD × median repeat distance, FLOOR, CAP). */
const THRESHOLD_SPREAD = 1.8;
const THRESHOLD_FLOOR = 0.5;
const THRESHOLD_CAP = 2.0;
/** Used when a sign has too few samples to measure (only for checks while teaching). */
export const DEFAULT_THRESHOLD = 0.9;

export interface SignTemplate {
  signId: string;
  /** Compact frames of each sample's core. */
  cores: Float32Array[][];
  /** Compact frames of each whole sample (for leave-one-out). */
  wholes: Float32Array[][];
  threshold: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The middle of a recording, where the sign itself is. */
export function sampleCore(frames: readonly Float32Array[], letter: boolean): Float32Array[] {
  const trim = Math.floor(frames.length * (letter ? CORE_TRIM.letter : CORE_TRIM.other));
  const core = frames.slice(trim, frames.length - trim);
  return core.length >= 3 ? core : [...frames];
}

export function compactSequence(frames: readonly ArrayLike<number>[], mirror = false): Float32Array[] {
  return frames.map((values) => compactFrame(values, mirror));
}

export function buildTemplate(sign: PersonalSign): SignTemplate | null {
  const letter = sign.target.kind === 'letter';
  const decoded: Float32Array[][] = [];
  for (const sample of sign.samples) {
    try {
      decoded.push(decodeFrames(sample.data, sample.frames, sample.dim));
    } catch {
      // A damaged sample is skipped rather than breaking recognition.
    }
  }
  if (decoded.length === 0) return null;
  const wholes = decoded.map((frames) => compactSequence(frames));
  const cores = decoded.map((frames) => compactSequence(sampleCore(frames, letter)));

  let threshold = DEFAULT_THRESHOLD;
  if (decoded.length >= 2) {
    const repeats = cores.map((core, i) =>
      Math.min(...wholes.filter((_, k) => k !== i).map((other) => subsequenceDtw(core, other))),
    );
    threshold = Math.min(THRESHOLD_CAP, Math.max(THRESHOLD_FLOOR, THRESHOLD_SPREAD * median(repeats)));
  }
  return { signId: sign.id, cores, wholes, threshold };
}

/** Templates for every sign with enough samples to be recognized. */
export function buildTemplates(signs: readonly PersonalSign[]): SignTemplate[] {
  return signs
    .filter((s) => s.samples.length >= MIN_SAMPLES_FOR_RECOGNITION)
    .map(buildTemplate)
    .filter((t): t is SignTemplate => t !== null);
}

/** Query frames reduced to the part with hands, compacted as-is and mirrored. */
export interface PreparedQuery {
  normal: Float32Array[];
  mirrored: Float32Array[];
}

export function prepareQuery(frames: readonly (ArrayLike<number> | null)[]): PreparedQuery | null {
  const span = handSpan(frames);
  if (!span) return null;
  const used = frames.slice(span[0], span[1] + 1).filter((v): v is ArrayLike<number> => v !== null);
  if (used.filter((v) => handsVisible(v)).length < 3) return null;
  return { normal: compactSequence(used), mirrored: compactSequence(used, true) };
}

/** Distance of the query to a sign, relative to that sign's acceptance distance (≤ 1: a match). */
export function relativeDistance(template: SignTemplate, query: PreparedQuery): number {
  let best = Infinity;
  for (const core of template.cores) {
    best = Math.min(best, subsequenceDtw(core, query.normal), subsequenceDtw(core, query.mirrored));
  }
  return best / template.threshold;
}
