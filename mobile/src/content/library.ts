import type { LanguageCode } from '@/i18n/languages';

import data from './data/signs.json';
import { SIGN_CATEGORIES, type SignCategory, type SignEntry, type SignLibrary } from './types';

/** Returns a list of problems; an empty list means the library is valid. */
export function validateLibrary(library: SignLibrary): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const sign of library.signs) {
    const where = `sign "${sign.id}"`;
    if (!/^[a-z0-9_]+$/.test(sign.id)) problems.push(`${where}: id must be snake_case`);
    if (ids.has(sign.id)) problems.push(`${where}: duplicate id`);
    ids.add(sign.id);
    if (!(SIGN_CATEGORIES as readonly string[]).includes(sign.category)) {
      problems.push(`${where}: unknown category "${sign.category}"`);
    }
    if (!sign.meaning.en?.trim()) problems.push(`${where}: missing English meaning`);
    if (sign.category === 'emergency' && !sign.emergency) problems.push(`${where}: emergency category must be flagged`);
    if (sign.media && sign.verification.status !== 'verified') {
      problems.push(`${where}: media present but not verified`);
    }
    if (sign.verification.status === 'verified') {
      if (!sign.verification.reviewedBy || !sign.verification.source) {
        problems.push(`${where}: verified entries need reviewedBy and source`);
      }
      if (!sign.media) problems.push(`${where}: verified entries need a demonstration`);
      if (sign.media && (!sign.media.license || !sign.media.consentRef)) {
        problems.push(`${where}: media needs a license and a consent reference`);
      }
    }
  }
  return problems;
}

const library = data as SignLibrary;
const byId = new Map(library.signs.map((s) => [s.id, s]));

export function getLibrary(): SignLibrary {
  return library;
}

export function getSign(id: string): SignEntry | undefined {
  return byId.get(id);
}

export function signsInCategory(category: SignCategory): SignEntry[] {
  return library.signs.filter((s) => s.category === category);
}

/** Meaning of a sign in `language`, falling back to English. */
export function signMeaning(sign: SignEntry, language: LanguageCode): { text: string; language: LanguageCode } {
  const text = sign.meaning[language];
  return text ? { text, language } : { text: sign.meaning.en, language: 'en' };
}

export function isEmergencySign(id: string): boolean {
  return byId.get(id)?.emergency ?? false;
}

/** A demonstration may be shown only for verified entries. */
export function hasVerifiedDemonstration(sign: SignEntry): boolean {
  return sign.verification.status === 'verified' && sign.media !== null;
}
