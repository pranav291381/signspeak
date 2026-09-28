import { phraseOf, signKeys, textWords, wordForms } from '../words';

describe('textWords', () => {
  it('lower-cases, drops punctuation and spells out contractions', () => {
    expect(textWords('Hello! How are you, Ravi?')).toEqual(['hello', 'how', 'are', 'you', 'ravi']);
    expect(textWords("I'm happy, it’s a T-shirt")).toEqual(['i', 'am', 'happy', 'it', 'is', 'a', 't', 'shirt']);
    expect(textWords("Don't. Can't. The teacher's bag")).toEqual(['do', 'not', 'can', 'not', 'the', 'teacher', 'bag']);
    expect(textWords('  ?! ')).toEqual([]);
    expect(phraseOf('Good  Morning!')).toBe('good morning');
  });
});

describe('signKeys', () => {
  it('lets a sign be found by its full name and each alternative', () => {
    expect(signKeys('Big / large')).toEqual(['big large', 'big', 'large']);
    expect(signKeys('Race (ethnicity)')).toEqual(['race ethnicity', 'race']);
    expect(signKeys('T-Shirt')).toEqual(['t shirt', 'tshirt']);
    expect(signKeys('Good Morning')).toEqual(['good morning']);
  });
});

describe('wordForms', () => {
  it('offers the base form of plurals and verb forms', () => {
    expect(wordForms('teachers')).toContain('teacher');
    expect(wordForms('boxes')).toContain('box');
    expect(wordForms('babies')).toContain('baby');
    expect(wordForms('painting')).toContain('paint');
    expect(wordForms('exercising')).toContain('exercise');
    expect(wordForms('shopping')).toContain('shop');
    expect(wordForms('dried')).toContain('dry');
    expect(wordForms('liked')).toContain('like');
    expect(wordForms('women')).toEqual(expect.arrayContaining(['woman']));
    expect(wordForms('shoe')).toContain('shoes');
  });

  it('does not turn short or look-alike words into other signs', () => {
    expect(wordForms('is')).not.toContain('i');
    expect(wordForms('its')).not.toContain('it');
    expect(wordForms('news')).toEqual([]);
    expect(wordForms('meaning')).toEqual([]);
    expect(wordForms('bus')).toEqual([]);
  });
});
