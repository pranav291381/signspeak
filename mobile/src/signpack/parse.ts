import { LANGUAGE_CODES, type LanguageCode } from '@/i18n/languages';
import { XY_FRAME_DIM } from '@/personal/codec';
import type { ReferenceSign } from '@/personal/matcher';
import { SAMPLE_FPS } from '@/personal/sample';
import { FEATURE_SPEC_VERSION, FRAME_DIM } from '@/recognition/featureSpec';

import { SIGN_PACK_FORMAT, SIGN_PACK_VERSION, type SignPack, type SignPackSample, type SignPackSign } from './types';

export class SignPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignPackError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/** Thresholds outside this range are mistakes, not calibration. */
const THRESHOLD_RANGE = [0.05, 5] as const;

function validThreshold(value: unknown): number | undefined {
  return typeof value === 'number' && value >= THRESHOLD_RANGE[0] && value <= THRESHOLD_RANGE[1] ? value : undefined;
}

function parseSample(value: unknown): SignPackSample | null {
  if (!isRecord(value)) return null;
  const { frames, dim, data } = value;
  if (typeof frames !== 'number' || !Number.isInteger(frames) || frames < 1) return null;
  if ((dim !== FRAME_DIM && dim !== XY_FRAME_DIM) || typeof data !== 'string' || !BASE64.test(data)) return null;
  // Int16 values, base64: 4 characters per 3 bytes.
  if (data.length !== Math.ceil((frames * dim * 2) / 3) * 4) return null;
  return { frames, dim, data };
}

function parseSign(value: unknown, packId: string): SignPackSign | null {
  if (!isRecord(value)) return null;
  const { id, text, language, category, sourceUrl, letter, samples } = value;
  const threshold = validThreshold(value.threshold);
  if (!isText(id) || !id.startsWith(`${packId}:`) || !isText(text)) return null;
  if (!LANGUAGE_CODES.includes(language as LanguageCode)) return null;
  if (!Array.isArray(samples)) return null;
  const parsed = samples.map(parseSample).filter((s): s is SignPackSample => s !== null);
  if (parsed.length === 0) return null;
  return {
    id,
    text: text.trim(),
    language: language as LanguageCode,
    ...(isText(category) ? { category } : {}),
    ...(isText(sourceUrl) && /^https?:\/\//.test(sourceUrl) ? { sourceUrl } : {}),
    ...(letter === true ? { letter: true } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
    samples: parsed,
  };
}

/**
 * Checks a sign pack read from JSON. A pack that does not fit this app (other
 * format, features or frame rate) is rejected; single broken signs are left out
 * and counted, so one bad entry never loses the whole vocabulary.
 */
export function parseSignPack(value: unknown): { pack: SignPack; skipped: number } {
  if (!isRecord(value) || value.format !== SIGN_PACK_FORMAT) throw new SignPackError('Not a sign pack');
  if (value.version !== SIGN_PACK_VERSION) throw new SignPackError(`Unsupported sign pack version ${String(value.version)}`);
  if (value.featureSpecVersion !== FEATURE_SPEC_VERSION) throw new SignPackError('Sign pack was made for other landmark features');
  if (value.sampleFps !== SAMPLE_FPS) throw new SignPackError('Sign pack was made at another frame rate');
  const { id, name, source, createdAt, defaultThreshold, signs } = value;
  if (!isText(id) || !/^[a-z0-9-]+$/.test(id) || !isText(name) || !isText(createdAt)) throw new SignPackError('Sign pack header is incomplete');
  if (!isRecord(source) || !isText(source.name) || !isText(source.url) || !isText(source.permission)) {
    throw new SignPackError('Sign pack does not say where its signs come from');
  }
  if (!Array.isArray(signs)) throw new SignPackError('Sign pack has no signs');

  const seen = new Set<string>();
  const kept: SignPackSign[] = [];
  for (const entry of signs) {
    const sign = parseSign(entry, id);
    if (!sign || seen.has(sign.id)) continue;
    seen.add(sign.id);
    kept.push(sign);
  }
  const threshold = validThreshold(defaultThreshold);
  return {
    pack: {
      format: SIGN_PACK_FORMAT,
      version: SIGN_PACK_VERSION,
      id,
      name,
      featureSpecVersion: FEATURE_SPEC_VERSION,
      sampleFps: SAMPLE_FPS,
      source: { name: source.name, url: source.url, permission: source.permission },
      createdAt,
      ...(threshold !== undefined ? { defaultThreshold: threshold } : {}),
      signs: kept,
    },
    skipped: signs.length - kept.length,
  };
}

/** The pack's signs, ready for the recognizer. */
export function packReferences(pack: SignPack): ReferenceSign[] {
  return pack.signs.map((sign) => {
    const threshold = sign.threshold ?? pack.defaultThreshold;
    return { id: sign.id, letter: sign.letter === true, samples: sign.samples, ...(threshold !== undefined ? { threshold } : {}) };
  });
}
