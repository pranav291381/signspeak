import { getSign } from '../library';
import { lookupPhrase, normalizeText } from '../matcher';
import type { SignEntry } from '../types';

const ids = (result: ReturnType<typeof lookupPhrase>) =>
  result.status === 'match' ? result.signs.map((s) => s.id) : result.status === 'no_match' ? result.related.map((s) => s.id) : [];

describe('normalizeText', () => {
  it('lower-cases, strips punctuation and collapses spaces', () => {
    expect(normalizeText('  Thank   YOU!! ')).toBe('thank you');
    expect(normalizeText("I don't understand.")).toBe('i don t understand');
  });

  it('keeps Devanagari combining marks and removes the danda', () => {
    expect(normalizeText('धन्यवाद।')).toBe('धन्यवाद');
    expect(normalizeText('आप कैसे हैं?')).toBe('आप कैसे हैं');
  });

  it('treats composed and decomposed forms alike', () => {
    // "ज़" as one code point vs. "ज" + nukta
    expect(normalizeText('ज़')).toBe(normalizeText('ज़'));
  });
});

describe('lookupPhrase', () => {
  it('reports empty input', () => {
    expect(lookupPhrase('   ?! ')).toEqual({ status: 'empty' });
  });

  it('finds whole phrases in English and Hindi', () => {
    expect(lookupPhrase('Thank you!')).toMatchObject({ status: 'match' });
    expect(ids(lookupPhrase('Thank you!'))).toEqual(['thank_you']);
    expect(ids(lookupPhrase('शुक्रिया'))).toEqual(['thank_you']);
    expect(ids(lookupPhrase('How are you?'))).toEqual(['how_are_you']);
    expect(ids(lookupPhrase('5'))).toEqual(['number_5']);
  });

  it('returns every sign when a phrase is ambiguous instead of choosing one', () => {
    const base = getSign('wait')!;
    const fixture: SignEntry[] = [
      { ...base, id: 'sign_a', phrases: { en: ['bank'] } },
      { ...base, id: 'sign_b', phrases: { en: ['bank', 'river bank'] } },
    ];
    const result = lookupPhrase('Bank', fixture);
    expect(result.status).toBe('match');
    expect(ids(result)).toEqual(['sign_a', 'sign_b']);
  });

  it('suggests separate related signs, longest phrase first, in sentence order', () => {
    const result = lookupPhrase('Thank you doctor, I need water');
    expect(result.status).toBe('no_match');
    expect(ids(result)).toEqual(['thank_you', 'doctor', 'water']);
  });

  it('does not match inside other words', () => {
    expect(ids(lookupPhrase('hierarchy'))).toEqual([]);
    expect(lookupPhrase('hierarchy')).toMatchObject({ status: 'no_match', related: [] });
  });

  it('limits very long input', () => {
    expect(() => lookupPhrase('water '.repeat(10_000))).not.toThrow();
  });
});
