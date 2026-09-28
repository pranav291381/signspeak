import { getLibrary } from '@/content/library';
import { MAX_QUERY_LENGTH } from '@/content/matcher';
import type { MotionClip } from '@/diagram/timeline';
import type { LanguageCode } from '@/i18n/languages';
import { clipFromRecording, type MotionLibrary } from '@/motion/library';
import { phraseOf, textWords, wordForms } from '@/motion/words';
import { targetText } from '@/personal/labels';
import { sampleFrames, signIdFor } from '@/personal/store';
import type { PersonalSign } from '@/personal/types';

/** Longest phrase (in words) matched as one sign. */
const MAX_PHRASE_WORDS = 5;

/** A recorded sign that can be shown for some words. */
export interface SignChoice {
  id: string;
  /** Name of the sign ("Teacher"), as its source gives it. */
  name: string;
  category?: string;
  /** `pack`: a sign pack recording (e.g. INCLUDE). `personal`: recorded on this phone. */
  source: 'pack' | 'personal';
  clip: MotionClip;
}

export interface PlannedItem {
  key: string;
  /** The words as typed ("teachers"), or a letter being spelled. */
  caption: string;
  /** `missing`: no recorded sign for these words. */
  kind: 'sign' | 'letter' | 'missing';
  /** Signs for these words, the one to show first. Empty when missing. */
  choices: SignChoice[];
  /** Letters: the word they spell. */
  word?: string;
}

export interface SignPlan {
  items: PlannedItem[];
  /** Words with no sign, each once, in the order typed. */
  missing: string[];
}

export interface PlanSources {
  library: MotionLibrary | null;
  signs: readonly PersonalSign[];
  get: (id: string) => PersonalSign | undefined;
  language: LanguageCode;
}

function personalClip(sign: PersonalSign | undefined): MotionClip | null {
  const sample = sign?.samples[0];
  if (!sample) return null;
  try {
    const clip = clipFromRecording(sampleFrames(sample));
    return clip.skeletons.length > 0 ? clip : null;
  } catch {
    return null;
  }
}

/**
 * Looks up recorded signs for phrases: the motion packs' signs first (recorded
 * by Deaf signers), then signs recorded on this phone for the same words.
 */
function makeFinder({ library, signs, get, language }: PlanSources) {
  const personal = new Map<string, PersonalSign[]>();
  const addPersonal = (phrase: string, sign: PersonalSign | undefined) => {
    if (!phrase || !sign || sign.samples.length === 0) return;
    const list = personal.get(phrase) ?? [];
    if (!list.includes(sign)) list.push(sign);
    personal.set(phrase, list);
  };
  for (const sign of signs) {
    if (sign.target.kind === 'custom') addPersonal(phraseOf(sign.target.text), sign);
  }
  // Library concepts (e.g. "thank you", "धन्यवाद") recorded on this phone.
  for (const entry of getLibrary().signs) {
    const recorded = get(signIdFor({ kind: 'library', signId: entry.id }));
    if (!recorded) continue;
    const texts = [...Object.values(entry.meaning), ...Object.values(entry.phrases).flat()] as string[];
    for (const text of texts) addPersonal(phraseOf(text), recorded);
  }

  return (phrase: string): SignChoice[] => {
    const choices: SignChoice[] = [];
    for (const sign of library?.find(phrase) ?? []) {
      const clip = library!.clip(sign.id);
      if (clip && clip.skeletons.length > 0) {
        choices.push({ id: sign.id, name: sign.text, ...(sign.category ? { category: sign.category } : {}), source: 'pack', clip });
      }
    }
    for (const sign of personal.get(phrase) ?? []) {
      const clip = personalClip(sign);
      if (clip) choices.push({ id: sign.id, name: targetText(sign.target, language).text, source: 'personal', clip });
    }
    return choices;
  };
}

/**
 * Text → recorded signs, one after another in the order typed.
 *
 * Whole phrases are matched first (longest first), then single words, then
 * other forms of a word ("teachers" → Teacher). A word with no sign is spelled
 * with the letters recorded on this phone when every letter has been recorded,
 * and otherwise listed as missing. This shows signs word by word; it is not a
 * translation (ISL has its own grammar and word order).
 */
export function planSigns(text: string, sources: PlanSources): SignPlan | null {
  const words = textWords(text.slice(0, MAX_QUERY_LENGTH));
  if (words.length === 0) return null;
  const find = makeFinder(sources);
  const items: PlannedItem[] = [];
  const missing: string[] = [];
  const push = (item: Omit<PlannedItem, 'key'>) => items.push({ key: `${items.length}`, ...item });

  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let length = Math.min(MAX_PHRASE_WORDS, words.length - i); length >= 1 && !matched; length--) {
      const phrase = words.slice(i, i + length).join(' ');
      const choices = find(phrase);
      if (choices.length > 0) {
        push({ caption: phrase, kind: 'sign', choices });
        i += length;
        matched = true;
      }
    }
    if (matched) continue;

    const word = words[i]!;
    i += 1;
    const form = wordForms(word).find((f) => find(f).length > 0);
    if (form) {
      push({ caption: word, kind: 'sign', choices: find(form) });
      continue;
    }
    const letters = /^[a-z]+$/.test(word)
      ? [...word].map((letter) => ({ letter, clip: personalClip(sources.get(signIdFor({ kind: 'letter', letter }))) }))
      : [];
    if (letters.length > 0 && letters.every((l) => l.clip)) {
      for (const { letter, clip } of letters) {
        const id = signIdFor({ kind: 'letter', letter });
        push({
          caption: letter.toUpperCase(),
          kind: 'letter',
          word,
          choices: [{ id, name: letter.toUpperCase(), source: 'personal', clip: clip! }],
        });
      }
      continue;
    }
    if (!missing.includes(word)) missing.push(word);
    push({ caption: word, kind: 'missing', choices: [] });
  }
  return { items, missing };
}
