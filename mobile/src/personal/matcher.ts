import { handsRaised } from '@/recognition/features';

import { decodeSpecFrames } from './codec';
import { compactFrame } from './compact';
import { subsequenceDtw } from './dtw';
import { handSpan } from './sample';
import { MIN_SAMPLES_FOR_RECOGNITION, type PersonalSign } from './types';

/**
 * Sign matching: a query is compared with each recorded sample by subsequence
 * DTW over compact frames. A sign with several recordings gets its own
 * acceptance distance from how consistently it was recorded (leave-one-out),
 * so a carefully repeated sign is matched strictly and a naturally variable one
 * more loosely, within fixed bounds. A sign with one recording (a dictionary
 * sign pack) uses the distance given with it, or DEFAULT_THRESHOLD.
 */

/** Share of a sample trimmed from each end: raising/lowering the hands is not the sign. */
const CORE_TRIM = { letter: 0.25, other: 0.1 } as const;
/** Acceptance distance = clamp(SPREAD × median repeat distance, FLOOR, CAP). */
const THRESHOLD_SPREAD = 1.8;
const THRESHOLD_FLOOR = 0.5;
const THRESHOLD_CAP = 1.2;
/** Used when a sign has too few samples to measure (one recording, or checks while teaching). */
export const DEFAULT_THRESHOLD = 0.9;

/** One recording in its stored form (see codec.ts). */
export interface EncodedSample {
  frames: number;
  dim: number;
  data: string;
}

/** A sign to recognize, from any source: taught on this phone or from a sign pack. */
export interface ReferenceSign {
  /** The recognition label. */
  id: string;
  /** A fingerspelled letter (a held handshape): more of each recording's ends is trimmed. */
  letter: boolean;
  samples: readonly EncodedSample[];
  /** Acceptance distance when it cannot be measured from repeats (a single recording). */
  threshold?: number;
}

export function referenceFromPersonal(sign: PersonalSign): ReferenceSign {
  return { id: sign.id, letter: sign.target.kind === 'letter', samples: sign.samples };
}

export interface SignTemplate {
  signId: string;
  /** Compact frames of each sample's core. */
  cores: Float32Array[][];
  /** Compact frames of each whole sample (for leave-one-out; empty when not measured). */
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

export function buildTemplate(sign: PersonalSign | ReferenceSign): SignTemplate | null {
  const reference = 'target' in sign ? referenceFromPersonal(sign) : sign;
  const { letter } = reference;
  const decoded: Float32Array[][] = [];
  for (const sample of reference.samples) {
    try {
      decoded.push(decodeSpecFrames(sample.data, sample.frames, sample.dim));
    } catch {
      // A damaged sample is skipped rather than breaking recognition.
    }
  }
  if (decoded.length === 0) return null;
  // A given acceptance distance wins: recordings of different signers or
  // variants (a dictionary) are not repeats whose spread can be measured.
  const measure = reference.threshold === undefined && decoded.length >= 2;
  // Whole samples are only needed to measure repeats (leave-one-out).
  const wholes = measure ? decoded.map((frames) => compactSequence(frames)) : [];
  const cores = decoded.map((frames) => compactSequence(sampleCore(frames, letter)));

  let threshold = reference.threshold ?? DEFAULT_THRESHOLD;
  if (measure) {
    const repeats = cores.map((core, i) =>
      Math.min(...wholes.filter((_, k) => k !== i).map((other) => subsequenceDtw(core, other))),
    );
    threshold = Math.min(THRESHOLD_CAP, Math.max(THRESHOLD_FLOOR, THRESHOLD_SPREAD * median(repeats)));
  }
  return { signId: reference.id, cores, wholes, threshold };
}

/** Templates for every reference sign that could be decoded. */
export function buildReferenceTemplates(references: readonly ReferenceSign[]): SignTemplate[] {
  return references.map(buildTemplate).filter((t): t is SignTemplate => t !== null);
}

/** Personal signs with enough samples to be recognized. */
export function personalReferences(signs: readonly PersonalSign[]): ReferenceSign[] {
  return signs.filter((s) => s.samples.length >= MIN_SAMPLES_FOR_RECOGNITION).map(referenceFromPersonal);
}

/** Templates for every personal sign with enough samples to be recognized. */
export function buildTemplates(signs: readonly PersonalSign[]): SignTemplate[] {
  return buildReferenceTemplates(personalReferences(signs));
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
  if (used.filter((v) => handsRaised(v)).length < 3) return null;
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
