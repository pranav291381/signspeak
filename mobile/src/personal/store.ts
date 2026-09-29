import { normalizeText } from '@/content/matcher';
import { isLanguageCode } from '@/i18n/languages';
import { FEATURE_SPEC_VERSION, FRAME_DIM } from '@/recognition/featureSpec';
import { readJson, type KeyValueStore } from '@/storage/keyValueStore';

import { decodeFrames, encodeFrames } from './codec';
import { ALPHABET, MAX_SAMPLES, type PersonalSign, type SignSample, type SignTarget } from './types';

/**
 * Persistence for personal signs: one key per sign plus an index of IDs, so a
 * change rewrites only that sign (AsyncStorage rows are size-limited on Android).
 * Everything stays on this phone.
 */
export const SIGNS_INDEX_KEY = 'islconnect.signs.v1.index';
export const SIGN_KEY_PREFIX = 'islconnect.signs.v1.item.';

export const MAX_CUSTOM_TEXT = 60;

/** A model label a vocabulary sign may be taught under: `<pack>:<sign>`, not one of the personal prefixes. */
const VOCABULARY_LABEL = /^(?!library:|letter:|custom:)[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

export function isVocabularyLabel(label: string): boolean {
  return VOCABULARY_LABEL.test(label);
}

/** Stable ID: teaching the same thing again adds recordings to the same sign. */
export function signIdFor(target: SignTarget): string {
  switch (target.kind) {
    case 'vocabulary':
      // The model's own label, so the person's recordings and the model speak of the same sign.
      return target.label;
    case 'library':
      return `library:${target.signId}`;
    case 'letter':
      return `letter:${target.letter.toLowerCase()}`;
    case 'custom':
      return `custom:${normalizeText(target.text)}`;
  }
}

export function makeSample(frames: readonly Float32Array[], recordedAt = new Date()): SignSample {
  return { frames: frames.length, dim: FRAME_DIM, data: encodeFrames(frames, FRAME_DIM), recordedAt: recordedAt.toISOString() };
}

export function sampleFrames(sample: SignSample): Float32Array[] {
  return decodeFrames(sample.data, sample.frames, sample.dim);
}

/** `sign` with one more recording (the oldest is dropped past MAX_SAMPLES). */
export function withSample(
  sign: PersonalSign | undefined,
  target: SignTarget,
  frames: readonly Float32Array[],
  now = new Date(),
): PersonalSign {
  const sample = makeSample(frames, now);
  const stamp = now.toISOString();
  if (!sign) {
    return { id: signIdFor(target), target, samples: [sample], featureSpecVersion: FEATURE_SPEC_VERSION, createdAt: stamp, updatedAt: stamp };
  }
  return { ...sign, samples: [...sign.samples, sample].slice(-MAX_SAMPLES), updatedAt: stamp };
}

function sanitizeTarget(raw: unknown): SignTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (
    t.kind === 'vocabulary' &&
    typeof t.label === 'string' &&
    isVocabularyLabel(t.label) &&
    typeof t.text === 'string' &&
    t.text.trim() &&
    isLanguageCode(t.language)
  ) {
    return { kind: 'vocabulary', label: t.label, text: t.text.trim().slice(0, MAX_CUSTOM_TEXT), language: t.language };
  }
  if (t.kind === 'library' && typeof t.signId === 'string' && /^[a-z0-9_]+$/.test(t.signId)) {
    return { kind: 'library', signId: t.signId };
  }
  if (t.kind === 'letter' && typeof t.letter === 'string' && ALPHABET.includes(t.letter.toLowerCase())) {
    return { kind: 'letter', letter: t.letter.toLowerCase() };
  }
  if (t.kind === 'custom' && typeof t.text === 'string' && normalizeText(t.text) && isLanguageCode(t.language)) {
    return { kind: 'custom', text: t.text.trim().slice(0, MAX_CUSTOM_TEXT), language: t.language };
  }
  return null;
}

function sanitizeSample(raw: unknown): SignSample | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.frames !== 'number' || s.dim !== FRAME_DIM || typeof s.data !== 'string') return null;
  try {
    decodeFrames(s.data, s.frames, s.dim);
  } catch {
    return null;
  }
  return { frames: s.frames, dim: s.dim, data: s.data, recordedAt: typeof s.recordedAt === 'string' ? s.recordedAt : '' };
}

/** Validates stored JSON; damaged recordings are dropped, not fatal. */
export function sanitizeSign(raw: unknown): PersonalSign | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const target = sanitizeTarget(s.target);
  if (!target || s.featureSpecVersion !== FEATURE_SPEC_VERSION || !Array.isArray(s.samples)) return null;
  const samples = s.samples.map(sanitizeSample).filter((x): x is SignSample => x !== null).slice(-MAX_SAMPLES);
  if (samples.length === 0) return null;
  return {
    id: signIdFor(target),
    target,
    samples,
    featureSpecVersion: FEATURE_SPEC_VERSION,
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : '',
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : '',
  };
}

export async function loadSigns(store: KeyValueStore): Promise<PersonalSign[]> {
  const index = await readJson(store, SIGNS_INDEX_KEY);
  const ids = Array.isArray(index) ? index.filter((id): id is string => typeof id === 'string') : [];
  const signs: PersonalSign[] = [];
  for (const id of new Set(ids)) {
    const sign = sanitizeSign(await readJson(store, SIGN_KEY_PREFIX + id));
    if (sign && sign.id === id) signs.push(sign);
  }
  return signs;
}

/** Writes the sign first, then the index, so an interrupted save never indexes a missing sign. */
export async function saveSign(store: KeyValueStore, sign: PersonalSign, ids: readonly string[]): Promise<void> {
  await store.setItem(SIGN_KEY_PREFIX + sign.id, JSON.stringify(sign));
  await store.setItem(SIGNS_INDEX_KEY, JSON.stringify([...new Set([...ids, sign.id])]));
}

export async function deleteSign(store: KeyValueStore, id: string, ids: readonly string[]): Promise<void> {
  await store.setItem(SIGNS_INDEX_KEY, JSON.stringify(ids.filter((x) => x !== id)));
  await store.removeItem(SIGN_KEY_PREFIX + id);
}

export async function deleteAllSigns(store: KeyValueStore, ids: readonly string[]): Promise<void> {
  await store.removeItem(SIGNS_INDEX_KEY);
  for (const id of ids) await store.removeItem(SIGN_KEY_PREFIX + id);
}
