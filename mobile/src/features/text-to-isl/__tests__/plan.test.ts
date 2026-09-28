import { buildMotionLibrary } from '@/motion/library';
import type { PersonalSign } from '@/personal/types';
import { testMotionPack } from '@/test-utils/motion';
import { taughtSign } from '@/test-utils/signs';

import { planSigns, type PlanSources } from '../plan';
import { applySuggestion, suggestSigns } from '../suggest';

const library = buildMotionLibrary([
  testMotionPack([
    { text: 'Hello', category: 'Greetings' },
    { text: 'How are you', category: 'Greetings', motion: 'knock' },
    { text: 'Good', category: 'Adjectives' },
    { text: 'Good Morning', category: 'Greetings', motion: 'point_arc' },
    { text: 'Teacher', category: 'Jobs' },
    { text: 'Team', category: 'Society' },
    { text: 'I', category: 'Pronouns' },
    { text: 'Shoes', category: 'Clothes' },
  ]),
]);

function sources(signs: PersonalSign[] = [], language: 'en' | 'hi' = 'en', withLibrary = true): PlanSources {
  return { library: withLibrary ? library : null, signs, get: (id) => signs.find((s) => s.id === id), language };
}

describe('planSigns', () => {
  it('shows recorded signs for phrases first, then words, then other forms of a word', () => {
    const plan = planSigns('Hello! How are you, teachers? Good morning. Shoe', sources())!;
    expect(plan.items.map((i) => [i.caption, i.kind, i.choices[0]?.name])).toEqual([
      ['hello', 'sign', 'Hello'],
      ['how are you', 'sign', 'How are you'],
      ['teachers', 'sign', 'Teacher'],
      ['good morning', 'sign', 'Good Morning'],
      ['shoe', 'sign', 'Shoes'],
    ]);
    expect(plan.missing).toEqual([]);
    expect(plan.items[0]!.choices[0]).toEqual(expect.objectContaining({ source: 'pack', category: 'Greetings', id: 'test-motion:hello' }));
    expect(plan.items[0]!.choices[0]!.clip.skeletons.length).toBeGreaterThan(0);
  });

  it('lists words it has no sign for instead of guessing', () => {
    const plan = planSigns("I'm happy, am I", sources())!;
    expect(plan.items.map((i) => [i.caption, i.kind])).toEqual([
      ['i', 'sign'],
      ['am', 'missing'],
      ['happy', 'missing'],
      ['am', 'missing'],
      ['i', 'sign'],
    ]);
    expect(plan.missing).toEqual(['am', 'happy']);
    expect(planSigns('  ?! ', sources())).toBeNull();
  });

  it('adds signs recorded on this phone, after the recorded signs of Deaf signers', () => {
    const own = taughtSign({ kind: 'custom', text: 'Hello', language: 'en' }, 'knock');
    const chai = taughtSign({ kind: 'custom', text: 'Chai', language: 'en' }, 'knock');
    const plan = planSigns('hello chai', sources([own, chai]))!;
    expect(plan.items[0]!.choices.map((c) => c.source)).toEqual(['pack', 'personal']);
    expect(plan.items[1]!.choices).toEqual([expect.objectContaining({ source: 'personal', name: 'Chai' })]);
  });

  it('finds library concepts recorded on this phone by their Hindi phrases', () => {
    const namaste = taughtSign({ kind: 'library', signId: 'hello' });
    const plan = planSigns('नमस्ते', sources([namaste], 'hi'))!;
    expect(plan.items[0]!.choices).toEqual([expect.objectContaining({ source: 'personal', id: 'library:hello' })]);
  });

  it('spells a word with recorded letters only when every letter is recorded', () => {
    const letters = ['r', 'a', 'v', 'i'].map((letter) => taughtSign({ kind: 'letter', letter }, 'hold_fist', 1));
    const plan = planSigns('Ravi', sources(letters))!;
    expect(plan.items.map((i) => [i.caption, i.kind, i.word])).toEqual([
      ['R', 'letter', 'ravi'],
      ['A', 'letter', 'ravi'],
      ['V', 'letter', 'ravi'],
      ['I', 'letter', 'ravi'],
    ]);
    const partial = planSigns('Ravi', sources(letters.slice(0, 3)))!;
    expect(partial.items).toEqual([expect.objectContaining({ caption: 'ravi', kind: 'missing' })]);
  });

  it('still works without the recorded signs', () => {
    expect(planSigns('hello', sources([], 'en', false))!.missing).toEqual(['hello']);
  });
});

describe('suggestSigns', () => {
  it('completes the word being typed with signs that exist', () => {
    expect(suggestSigns(library, 'tea').map((s) => s.sign.text)).toEqual(['Team', 'Teacher']);
    expect(suggestSigns(library, 'good mor').map((s) => [s.sign.text, s.replaces])).toEqual([['Good Morning', 2]]);
    expect(suggestSigns(library, 'hello ')).toEqual([]);
    expect(suggestSigns(library, 't')).toEqual([]);
  });

  it('puts the chosen sign in place of the typed words', () => {
    const [morning] = suggestSigns(library, 'hello, good mor');
    expect(applySuggestion('hello, good mor', morning!)).toBe('hello, Good Morning ');
    const [team] = suggestSigns(library, 'the tea');
    expect(applySuggestion('the tea', team!)).toBe('the Team ');
  });
});
