import { getSign } from '@/content/library';
import { normalizeText } from '@/content/matcher';
import type { LanguageCode } from '@/i18n/languages';
import { MAX_SAMPLE_MS } from '@/personal/sample';
import { isVocabularyLabel, MAX_CUSTOM_TEXT, signIdFor } from '@/personal/store';
import { ALPHABET, MIN_SAMPLES_FOR_RECOGNITION, RECOMMENDED_SAMPLES, type PersonalSign, type SignTarget } from '@/personal/types';

export type TeachParams = { kind?: string; id?: string; label?: string; text?: string; letter?: string };

/** Name of a sign of the installed vocabulary, or undefined if it has no such sign. */
export type DescribeVocabulary = (label: string) => { text: string; language: LanguageCode } | undefined;

/**
 * What to record, from route parameters. `alphabet` walks through every letter
 * that has not been recorded yet. Returns null for anything invalid.
 */
export function parseTargets(
  params: TeachParams,
  language: LanguageCode,
  existing: (id: string) => PersonalSign | undefined,
  vocabulary: DescribeVocabulary = () => undefined,
): SignTarget[] | null {
  switch (params.kind) {
    case 'vocabulary': {
      const label = params.label ?? '';
      const sign = isVocabularyLabel(label) ? vocabulary(label) : undefined;
      return sign ? [{ kind: 'vocabulary', label, text: sign.text, language: sign.language }] : null;
    }
    case 'library':
      return params.id && getSign(params.id) ? [{ kind: 'library', signId: params.id }] : null;
    case 'custom': {
      const text = (params.text ?? '').trim().slice(0, MAX_CUSTOM_TEXT);
      return normalizeText(text) ? [{ kind: 'custom', text, language }] : null;
    }
    case 'letter': {
      const letter = (params.letter ?? '').toLowerCase();
      return ALPHABET.includes(letter) ? [{ kind: 'letter', letter }] : null;
    }
    case 'alphabet': {
      const missing = ALPHABET.filter((letter) => !existing(signIdFor({ kind: 'letter', letter })));
      return (missing.length > 0 ? missing : ALPHABET).map((letter) => ({ kind: 'letter', letter }));
    }
    default:
      return null;
  }
}

/** Takes the teach flow asks for: letters need fewer (a held handshape varies less). */
export function takesWanted(target: SignTarget): number {
  return target.kind === 'letter' ? MIN_SAMPLES_FOR_RECOGNITION : RECOMMENDED_SAMPLES;
}

/**
 * Recording length (ms): a held letter is short; a word needs room to move; a
 * sign of the model's vocabulary gets as long as a stored take can be (some,
 * like "good morning", are two signs in one).
 */
export function recordingMs(target: SignTarget): number {
  if (target.kind === 'letter') return 2000;
  return target.kind === 'vocabulary' ? MAX_SAMPLE_MS : 3000;
}
