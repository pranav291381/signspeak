import { FEATURE_SPEC_VERSION, FRAME_DIM } from '@/recognition/featureSpec';

import { SAMPLE_FPS } from './sample';
import type { PersonalSign } from './types';

/** Identifies the file; ml/scripts/import_my_signs.py reads it. */
export const EXPORT_FORMAT = 'signspeak.my-signs';
export const EXPORT_VERSION = 1;

export interface SignsExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  appVersion: string;
  featureSpecVersion: number;
  /** Values per frame of every take (feature spec v1: x, y, z of 51 points and 3 presence flags). */
  frameDim: number;
  fps: number;
  /** What the file holds, for whoever opens it. */
  contents: string;
  signs: PersonalSign[];
}

/**
 * Everything taught on this phone, as stored: hand and body points of each
 * take and what the sign means. No video or images.
 */
export function buildExport(signs: readonly PersonalSign[], appVersion: string, now = new Date()): SignsExport {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    appVersion,
    featureSpecVersion: FEATURE_SPEC_VERSION,
    frameDim: FRAME_DIM,
    fps: SAMPLE_FPS,
    contents:
      'Signs taught in SignSpeak: for each take, the positions of 51 hand and body points per frame ' +
      '(Int16 x 1000, little-endian, base64), and the word, letter or sign it means. No video or images.',
    signs: [...signs].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export const EXPORT_FILE_PREFIX = 'signspeak-my-signs-';

/** e.g. signspeak-my-signs-2026-10-08.json, dated on the phone's own calendar. */
export function exportFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${EXPORT_FILE_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
