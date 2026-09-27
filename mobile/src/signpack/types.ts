import type { LanguageCode } from '@/i18n/languages';

/**
 * A sign pack: reference recordings of signs, reduced to landmarks (no video),
 * made from a published source such as a sign language dictionary by
 * scripts/build-sign-pack.mjs. See docs/sign-packs.md.
 */
export const SIGN_PACK_FORMAT = 'islconnect-sign-pack';
export const SIGN_PACK_VERSION = 1;

export interface SignPackSource {
  /** Who published the videos. */
  name: string;
  url: string;
  /** How permission to use them was given. */
  permission: string;
}

/**
 * One recording, stored like a taught sign's sample (see personal/codec.ts):
 * `dim` is FRAME_DIM (full spec-v1 frames) or XY_FRAME_DIM (without depth,
 * what the pack builder writes).
 */
export interface SignPackSample {
  frames: number;
  dim: number;
  data: string;
}

export interface SignPackSign {
  /** Stable recognition label: `<pack id>:<slug>`. */
  id: string;
  /** What the sign means, exactly as the source gives it. */
  text: string;
  /** Language of `text`. */
  language: LanguageCode;
  category?: string;
  /** Page of the source showing this sign (credit, and for checking it). */
  sourceUrl?: string;
  /** A fingerspelled letter (a held handshape). */
  letter?: boolean;
  /** Acceptance distance, when calibrated. */
  threshold?: number;
  samples: SignPackSample[];
}

export interface SignPack {
  format: typeof SIGN_PACK_FORMAT;
  version: typeof SIGN_PACK_VERSION;
  /** Short stable id, the prefix of every sign id, e.g. "isl-dictionary". */
  id: string;
  name: string;
  featureSpecVersion: number;
  /** Frames per second of the samples. */
  sampleFps: number;
  source: SignPackSource;
  createdAt: string;
  /** Acceptance distance of signs without their own (not calibrated with signers yet). */
  defaultThreshold?: number;
  signs: SignPackSign[];
}
