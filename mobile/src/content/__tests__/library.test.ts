import { selectableLanguages } from '@/i18n/languages';

import {
  getLibrary,
  getSign,
  hasVerifiedDemonstration,
  isEmergencySign,
  signMeaning,
  signsInCategory,
  validateLibrary,
} from '../library';
import { SIGN_CATEGORIES, type SignEntry, type SignLibrary } from '../types';

const library = getLibrary();

describe('sign library data', () => {
  it('is valid', () => {
    expect(validateLibrary(library)).toEqual([]);
  });

  it('covers every learning category', () => {
    for (const category of SIGN_CATEGORIES) {
      expect(signsInCategory(category).length).toBeGreaterThan(0);
    }
  });

  it('does not claim any verified ISL content yet', () => {
    // When verified content is added, this test should be updated deliberately.
    expect(library.signs.filter((s) => s.verification.status === 'verified')).toEqual([]);
    expect(library.signs.filter((s) => s.media !== null)).toEqual([]);
  });

  it('does not invent sign order for multi-sign phrases', () => {
    for (const sign of signsInCategory('phrases')) {
      expect({ id: sign.id, gloss: sign.gloss }).toEqual({ id: sign.id, gloss: null });
    }
  });

  it('has a meaning and lookup phrases in every selectable language', () => {
    for (const sign of library.signs) {
      for (const { code } of selectableLanguages()) {
        expect({ id: sign.id, code, meaning: Boolean(sign.meaning[code]) }).toEqual({ id: sign.id, code, meaning: true });
        expect(sign.phrases[code]?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe('library helpers', () => {
  it('flags emergency signs', () => {
    expect(isEmergencySign('help')).toBe(true);
    expect(isEmergencySign('hello')).toBe(false);
    expect(isEmergencySign('not-a-sign')).toBe(false);
  });

  it('falls back to English when a meaning is missing', () => {
    const hello = getSign('hello')!;
    expect(signMeaning(hello, 'hi')).toEqual({ text: 'नमस्ते', language: 'hi' });
    expect(signMeaning(hello, 'ta')).toEqual({ text: 'Hello', language: 'en' });
  });

  it('never treats unverified media as a demonstration', () => {
    const sign: SignEntry = {
      ...getSign('hello')!,
      media: { kind: 'video', uri: 'x', license: 'CC-BY-4.0', consentRef: 'c1' },
    };
    expect(hasVerifiedDemonstration(sign)).toBe(false);
  });
});

describe('validateLibrary', () => {
  const base = getSign('hello')!;
  const lib = (signs: SignEntry[]): SignLibrary => ({ version: 't', notice: '', signs });

  it('rejects media on unverified entries', () => {
    const problems = validateLibrary(
      lib([{ ...base, media: { kind: 'video', uri: 'x', license: 'l', consentRef: 'c' } }]),
    );
    expect(problems.join()).toMatch(/media present but not verified/);
  });

  it('requires reviewer, source, media, license and consent for verified entries', () => {
    const problems = validateLibrary(lib([{ ...base, verification: { status: 'verified' } }]));
    expect(problems.join()).toMatch(/reviewedBy and source/);
    expect(problems.join()).toMatch(/need a demonstration/);
  });

  it('rejects duplicate ids and unflagged emergency entries', () => {
    const problems = validateLibrary(lib([base, base, { ...base, id: 'x', category: 'emergency', emergency: false }]));
    expect(problems.join()).toMatch(/duplicate id/);
    expect(problems.join()).toMatch(/must be flagged/);
  });
});
