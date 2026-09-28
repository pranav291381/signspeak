/**
 * Words of typed English text, and the phrases that find a sign by its name.
 * This is English text handling only (case, punctuation, plurals,
 * contractions); it says nothing about ISL grammar.
 */

const CONTRACTIONS: readonly [RegExp, string][] = [
  [/\bcan['’]t\b/g, 'can not'],
  [/\bwon['’]t\b/g, 'will not'],
  [/n['’]t\b/g, ' not'],
  [/['’]m\b/g, ' am'],
  [/['’]re\b/g, ' are'],
  [/['’]ve\b/g, ' have'],
  [/['’]ll\b/g, ' will'],
  [/['’]d\b/g, ' would'],
  // "he's" is "he is"; "teacher's" is a possessive, and loses its "'s".
  [/\b(he|she|it|that|what|where|who|there|here|how)['’]s\b/g, '$1 is'],
  [/['’]s\b/g, ''],
];

/** Lower-case words: contractions spelled out, other punctuation splits words. */
export function textWords(text: string): string[] {
  let out = text.normalize('NFC').toLocaleLowerCase();
  for (const [pattern, replacement] of CONTRACTIONS) out = out.replace(pattern, replacement);
  return out
    .replace(/['’‘`]/g, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export const phraseOf = (text: string) => textWords(text).join(' ');

/**
 * Phrases that find a sign called `name`, the full name first:
 * "Big / large" → "big large", "big", "large"; "Race (ethnicity)" → "race
 * ethnicity", "race"; "T-Shirt" → "t shirt", "tshirt".
 */
export function signKeys(name: string): string[] {
  const keys: string[] = [];
  const add = (text: string) => {
    const phrase = phraseOf(text);
    if (phrase && !keys.includes(phrase)) keys.push(phrase);
  };
  add(name);
  const base = name.replace(/\([^)]*\)/g, ' ');
  add(base);
  const parts = base.split('/');
  parts.forEach(add);
  for (const part of [name, ...parts]) if (part.includes('-')) add(part.replace(/-/g, ''));
  return keys;
}

/** Look like plurals or verb forms but are not (or would find the wrong sign). */
const NOT_INFLECTED = new Set([
  'always', 'bus', 'during', 'gas', 'lens', 'meaning', 'news', 'nothing', 'perhaps', 'plus', 'series',
  'something', 'species', 'this', 'thus', 'yes',
]);
const IRREGULAR: Readonly<Record<string, string>> = {
  children: 'child',
  men: 'man',
  mice: 'mouse',
  wives: 'wife',
  women: 'woman',
};
const MIN_STEM = 3;

/**
 * Other forms of an English word to look up when it has no sign of its own,
 * most likely first: "teachers" → "teacher", "painting" → "paint",
 * "dried" → "dry", "shoe" → "shoes". The app shows which sign was used.
 */
export function wordForms(word: string): string[] {
  if (NOT_INFLECTED.has(word)) return [];
  const forms: string[] = [];
  const add = (form: string) => {
    if (form.length >= MIN_STEM && form !== word && !forms.includes(form)) forms.push(form);
  };
  const stems = (stem: string) => {
    add(stem);
    add(`${stem}e`);
    if (/([^aeiou])\1$/.test(stem)) add(stem.slice(0, -1));
  };
  const irregular = IRREGULAR[word];
  if (irregular) add(irregular);
  if (word.endsWith('ies')) add(`${word.slice(0, -3)}y`);
  if (word.endsWith('es')) add(word.slice(0, -2));
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) add(word.slice(0, -1));
  if (word.endsWith('ied')) add(`${word.slice(0, -3)}y`);
  else if (word.endsWith('ed')) stems(word.slice(0, -2));
  if (word.endsWith('ing')) stems(word.slice(0, -3));
  if (!word.endsWith('s')) add(`${word}s`);
  return forms;
}
