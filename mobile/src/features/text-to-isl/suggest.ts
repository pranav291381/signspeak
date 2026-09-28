import type { MotionLibrary, MotionSign } from '@/motion/library';
import { signKeys, textWords } from '@/motion/words';

export interface Suggestion {
  sign: MotionSign;
  /** How many of the last typed words the sign's name replaces. */
  replaces: 1 | 2;
}

const MIN_PREFIX = 2;

/**
 * Signs whose name continues what is being typed ("tea" → Teacher, Team;
 * "good mor" → Good Morning), for completing a word with a sign that exists.
 */
export function suggestSigns(library: MotionLibrary, text: string, limit = 6): Suggestion[] {
  if (/\s$/.test(text)) return [];
  const words = textWords(text);
  const last = words[words.length - 1];
  if (!last || last.length < MIN_PREFIX) return [];
  const lastTwo = words.length >= 2 ? `${words[words.length - 2]} ${last}` : null;

  const ranked: { suggestion: Suggestion; rank: number }[] = [];
  for (const sign of library.signs) {
    const keys = signKeys(sign.text);
    let rank = -1;
    let replaces: 1 | 2 = 1;
    // The word typed is already this sign's name: nothing to complete.
    if (keys.includes(last) || (lastTwo && keys.includes(lastTwo))) continue;
    if (lastTwo && keys.some((k) => k.startsWith(lastTwo))) {
      rank = 0;
      replaces = 2;
    } else if (keys.some((k) => k.startsWith(last))) rank = 1;
    else if (keys.some((k) => k.split(' ').some((w) => w.startsWith(last)))) rank = 2;
    if (rank >= 0) ranked.push({ suggestion: { sign, replaces }, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.suggestion.sign.text.length - b.suggestion.sign.text.length || a.suggestion.sign.text.localeCompare(b.suggestion.sign.text))
    .slice(0, limit)
    .map((r) => r.suggestion);
}

/** `text` with its last `replaces` words replaced by `name`. */
export function applySuggestion(text: string, suggestion: Suggestion): string {
  const pattern = suggestion.replaces === 2 ? /\S+\s+\S+\s*$/ : /\S+\s*$/;
  return `${text.replace(pattern, '')}${suggestion.sign.text} `;
}

/** Sentences to try, shown only when every word has a sign. */
export const EXAMPLES = ['Hello, how are you?', 'Good morning', 'Thank you', 'Happy new year', 'Good night', 'Good afternoon'];
