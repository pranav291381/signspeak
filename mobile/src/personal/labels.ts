import { getSign, signMeaning } from '@/content/library';
import type { LanguageCode } from '@/i18n/languages';

import type { PersonalSign, SignTarget } from './types';

/** Text a personal sign stands for, in `language` where the library has a translation. */
export function targetText(target: SignTarget, language: LanguageCode): { text: string; language: LanguageCode } {
  switch (target.kind) {
    case 'vocabulary':
      return { text: target.text, language: target.language };
    case 'library': {
      const entry = getSign(target.signId);
      return entry ? signMeaning(entry, language) : { text: target.signId.replace(/_/g, ' '), language: 'en' };
    }
    case 'letter':
      return { text: target.letter.toUpperCase(), language };
    case 'custom':
      return { text: target.text, language: target.language };
  }
}

export function signText(sign: PersonalSign, language: LanguageCode): string {
  return targetText(sign.target, language).text;
}

/** Letter of a fingerspelling sign, or null. */
export function signLetter(sign: PersonalSign | undefined): string | null {
  return sign?.target.kind === 'letter' ? sign.target.letter : null;
}
