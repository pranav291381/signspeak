import type { LanguageCode } from '@/i18n/languages';

/**
 * What a personal sign stands for.
 * - `library`: a concept from the sign library (its meaning is translated for output).
 * - `custom`: any word or phrase typed by the user.
 * - `letter`: a letter of the fingerspelling alphabet (A–Z).
 */
export type SignTarget =
  | { kind: 'library'; signId: string }
  | { kind: 'custom'; text: string; language: LanguageCode }
  | { kind: 'letter'; letter: string };

/** One recording of a sign, reduced to landmarks (no images). */
export interface SignSample {
  /** Number of frames, recorded at SAMPLE_FPS. */
  frames: number;
  /** Values per frame (feature spec v1). */
  dim: number;
  /** Frame values × VALUE_SCALE as little-endian Int16, base64. See codec.ts. */
  data: string;
  /** ISO timestamp. */
  recordedAt: string;
}

/**
 * A sign taught on this phone: recordings made by the user (ideally a fluent
 * signer). They power recognition (Sign → Text) and the diagrams shown in
 * Text → ISL and the alphabet. Stored only on this phone.
 */
export interface PersonalSign {
  /** Stable: `library:<id>`, `letter:<a-z>` or `custom:<normalized text>`. Also the recognition label. */
  id: string;
  target: SignTarget;
  samples: SignSample[];
  featureSpecVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** Recordings needed before a sign is used for recognition. */
export const MIN_SAMPLES_FOR_RECOGNITION = 2;
/** Recordings the teach flow asks for. */
export const RECOMMENDED_SAMPLES = 3;
/** Older recordings are dropped beyond this. */
export const MAX_SAMPLES = 5;

export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
