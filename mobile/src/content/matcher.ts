import type { LanguageCode } from '@/i18n/languages';

import { getLibrary } from './library';
import type { SignEntry } from './types';

/**
 * Text → ISL, MVP stage: phrase lookup in the sign library.
 *
 * This is deliberately NOT translation. ISL has its own grammar (sign order,
 * use of space, facial grammar); replacing words one by one does not produce
 * ISL. Future stages plug in behind `TextToIslPipeline` (docs/architecture.md §7).
 */

export type LookupResult =
  | { status: 'empty' }
  /** One or more library entries for the whole phrase (a word can map to several signs). */
  | { status: 'match'; query: string; signs: SignEntry[] }
  /** Nothing for the whole phrase; `related` are separate signs for parts of it. */
  | { status: 'no_match'; query: string; related: SignEntry[] };

export const MAX_QUERY_LENGTH = 200;
const MAX_RELATED = 6;

/** Unicode-normalized, lower-case, punctuation-free, single-spaced. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface PhraseIndex {
  byPhrase: Map<string, SignEntry[]>;
  /** Longest phrases first, for related-sign search. */
  phrases: { words: string[]; sign: SignEntry }[];
}

function buildIndex(signs: readonly SignEntry[]): PhraseIndex {
  const byPhrase = new Map<string, SignEntry[]>();
  const phrases: PhraseIndex['phrases'] = [];
  for (const sign of signs) {
    const all = Object.values(sign.phrases).flat() as string[];
    for (const phrase of new Set(all.map(normalizeText).filter(Boolean))) {
      const list = byPhrase.get(phrase) ?? [];
      if (!list.includes(sign)) list.push(sign);
      byPhrase.set(phrase, list);
      phrases.push({ words: phrase.split(' '), sign });
    }
  }
  phrases.sort((a, b) => b.words.length - a.words.length);
  return { byPhrase, phrases };
}

let defaultIndex: PhraseIndex | null = null;

function indexFor(signs?: readonly SignEntry[]): PhraseIndex {
  if (signs) return buildIndex(signs);
  defaultIndex ??= buildIndex(getLibrary().signs);
  return defaultIndex;
}

function findSequence(haystack: string[], needle: string[], covered: boolean[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (covered[i + j] || haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Look up `text` in every language's phrase list.
 * @param signs override the library (tests).
 */
export function lookupPhrase(text: string, signs?: readonly SignEntry[]): LookupResult {
  const query = normalizeText(text.slice(0, MAX_QUERY_LENGTH));
  if (!query) return { status: 'empty' };
  const index = indexFor(signs);

  const exact = index.byPhrase.get(query);
  if (exact && exact.length > 0) return { status: 'match', query, signs: exact };

  // Longest phrases first, without overlap, reported in the order they occur.
  const words = query.split(' ');
  const covered = words.map(() => false);
  const found: { at: number; sign: SignEntry }[] = [];
  for (const { words: phraseWords, sign } of index.phrases) {
    if (found.some((f) => f.sign === sign)) continue;
    const at = findSequence(words, phraseWords, covered);
    if (at >= 0) {
      for (let k = at; k < at + phraseWords.length; k++) covered[k] = true;
      found.push({ at, sign });
    }
  }
  found.sort((a, b) => a.at - b.at);
  return { status: 'no_match', query, related: found.slice(0, MAX_RELATED).map((f) => f.sign) };
}

/** Meaning shown to the reader of the screen: app language, else English. */
export function displayMeaning(sign: SignEntry, language: LanguageCode): string {
  return sign.meaning[language] ?? sign.meaning.en;
}
