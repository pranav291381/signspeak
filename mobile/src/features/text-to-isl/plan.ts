import { getLibrary } from '@/content/library';
import { MAX_QUERY_LENGTH, normalizeText } from '@/content/matcher';
import type { SequenceItem } from '@/diagram/SignSequencePlayer';
import type { LanguageCode } from '@/i18n/languages';
import { targetText } from '@/personal/labels';
import { sampleFrames, signIdFor } from '@/personal/store';
import type { PersonalSign, SignTarget } from '@/personal/types';

/** Longest phrase (in words) matched as one sign. */
const MAX_PHRASE_WORDS = 5;

export interface PlannedItem extends SequenceItem {
  /** What to teach if it is missing. */
  target: SignTarget | null;
}

export interface SignPlan {
  items: PlannedItem[];
  /** Items with no recording yet. */
  missing: number;
}

function framesOf(sign: PersonalSign | undefined): Float32Array[] | null {
  const sample = sign?.samples[0];
  if (!sample) return null;
  try {
    return sampleFrames(sample);
  } catch {
    return null;
  }
}

function phraseIndex(signs: readonly PersonalSign[]): Map<string, SignTarget> {
  const index = new Map<string, SignTarget>();
  for (const entry of getLibrary().signs) {
    const texts = [...Object.values(entry.meaning), ...Object.values(entry.phrases).flat()] as string[];
    for (const text of texts) {
      const key = normalizeText(text);
      if (key && !index.has(key)) index.set(key, { kind: 'library', signId: entry.id });
    }
  }
  // Words the user taught themselves win over the library.
  for (const sign of signs) {
    if (sign.target.kind === 'custom') index.set(normalizeText(sign.target.text), sign.target);
  }
  return index;
}

/**
 * Text → a sequence of sign diagrams, in the order typed.
 *
 * Whole phrases are matched first (longest first), then single words; a word
 * with no sign is fingerspelled letter by letter (Latin letters only; ISL
 * fingerspelling uses the English alphabet) and numbers digit by digit.
 * This is a guide sign by sign, not a translation: ISL grammar and word order
 * differ from written languages.
 */
export function planSigns(
  text: string,
  signs: readonly PersonalSign[],
  get: (id: string) => PersonalSign | undefined,
  language: LanguageCode,
): SignPlan | null {
  const words = normalizeText(text.slice(0, MAX_QUERY_LENGTH)).split(' ').filter(Boolean);
  if (words.length === 0) return null;
  const index = phraseIndex(signs);
  const items: PlannedItem[] = [];
  const push = (target: SignTarget | null, caption: string, kind: 'sign' | 'letter', word?: string) => {
    const frames = target ? framesOf(get(signIdFor(target))) : null;
    items.push({ key: `${items.length}`, caption, frames, kind, word, target });
  };

  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let length = Math.min(MAX_PHRASE_WORDS, words.length - i); length >= 1 && !matched; length--) {
      const target = index.get(words.slice(i, i + length).join(' '));
      if (target) {
        push(target, targetText(target, language).text, 'sign');
        i += length;
        matched = true;
      }
    }
    if (matched) continue;

    const word = words[i]!;
    if (/^[a-z]+$/.test(word)) {
      for (const letter of word) push({ kind: 'letter', letter }, letter.toUpperCase(), 'letter', word);
    } else if (/^\d+$/.test(word)) {
      for (const digit of word) {
        const target = index.get(digit) ?? null;
        push(target, digit, 'sign', word);
      }
    } else {
      // No sign, and not something we can fingerspell (e.g. a Hindi word).
      push(null, word, 'sign');
    }
    i += 1;
  }
  return { items, missing: items.filter((item) => item.frames === null).length };
}
