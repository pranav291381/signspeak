import { getSign } from '@/content/library';
import { normalizeText } from '@/content/matcher';
import type { LanguageCode } from '@/i18n/languages';
import { MAX_CUSTOM_TEXT, signIdFor } from '@/personal/store';
import { ALPHABET, MIN_SAMPLES_FOR_RECOGNITION, RECOMMENDED_SAMPLES, type PersonalSign, type SignTarget } from '@/personal/types';

export type TeachParams = { kind?: string; id?: string; text?: string; letter?: string };

/**
 * What to record, from route parameters. `alphabet` walks through every letter
 * that has not been recorded yet. Returns null for anything invalid.
 */
export function parseTargets(
  params: TeachParams,
  language: LanguageCode,
  existing: (id: string) => PersonalSign | undefined,
): SignTarget[] | null {
  switch (params.kind) {
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

/** Recording length (ms): a held letter is short; a word needs room to move. */
export function recordingMs(target: SignTarget): number {
  return target.kind === 'letter' ? 2000 : 3000;
}
