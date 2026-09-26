import { getLibrary, getSign } from '@/content/library';
import type { SignEntry } from '@/content/types';
import { createMemoryStore } from '@/storage/keyValueStore';

import {
  learnedCount,
  loadProgress,
  PROGRESS_STORAGE_KEY,
  recordQuizAnswer,
  saveProgress,
  setLearned,
} from '../progress';
import { buildQuiz, scoreQuiz } from '../quiz';

/** Test fixture: pretend these entries were verified. Real data has none yet. */
function verifiedFixture(ids: string[]): SignEntry[] {
  return ids.map((id) => ({
    ...getSign(id)!,
    media: { kind: 'video', uri: `fixture://${id}`, license: 'test', consentRef: 'test' },
    verification: { status: 'verified', reviewedBy: 'fixture', source: 'fixture' },
  }));
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('quiz', () => {
  it('is unavailable with the current (unverified) library', () => {
    expect(buildQuiz(getLibrary().signs)).toEqual({
      status: 'unavailable',
      reason: 'not_enough_verified_content',
      verifiedCount: 0,
      required: 4,
    });
  });

  it('never uses unverified signs, even as wrong options', () => {
    const verified = verifiedFixture(['hello', 'thank_you', 'sorry', 'please', 'goodbye']);
    const signs = [...verified, getSign('water')!, getSign('food')!];
    const quiz = buildQuiz(signs, { random: seeded(3) });
    expect(quiz.status).toBe('ready');
    if (quiz.status !== 'ready') return;
    const allowed = new Set(verified.map((s) => s.id));
    for (const q of quiz.questions) {
      expect(allowed.has(q.signId)).toBe(true);
      expect(q.optionIds.every((id) => allowed.has(id))).toBe(true);
      expect(q.optionIds[q.answerIndex]).toBe(q.signId);
      expect(new Set(q.optionIds).size).toBe(4);
    }
  });

  it('asks each sign at most once and respects the question count', () => {
    const quiz = buildQuiz(verifiedFixture(['hello', 'thank_you', 'sorry', 'please', 'goodbye', 'yes']), {
      questionCount: 3,
      random: seeded(9),
    });
    if (quiz.status !== 'ready') throw new Error('expected a quiz');
    expect(quiz.questions).toHaveLength(3);
    expect(new Set(quiz.questions.map((q) => q.signId)).size).toBe(3);
  });

  it('scores answers', () => {
    const questions = [
      { signId: 'a', optionIds: ['a', 'b'], answerIndex: 0 },
      { signId: 'b', optionIds: ['a', 'b'], answerIndex: 1 },
    ];
    expect(scoreQuiz(questions, [0, 0])).toBe(1);
    expect(scoreQuiz(questions, [0, null])).toBe(1);
  });
});

describe('progress', () => {
  it('marks and unmarks learned signs', () => {
    let p = setLearned({}, 'hello', true, 100);
    expect(learnedCount(p, ['hello', 'water'])).toBe(1);
    p = setLearned(p, 'hello', false, 200);
    expect(learnedCount(p, ['hello'])).toBe(0);
  });

  it('counts quiz answers', () => {
    let p = recordQuizAnswer({}, 'hello', true);
    p = recordQuizAnswer(p, 'hello', false);
    expect(p.hello).toEqual({ learnedAt: null, quizAttempts: 2, quizCorrect: 1 });
  });

  it('persists and sanitizes stored progress', async () => {
    const store = createMemoryStore();
    await saveProgress(store, setLearned({}, 'hello', true, 5));
    await expect(loadProgress(store)).resolves.toEqual({ hello: { learnedAt: 5, quizAttempts: 0, quizCorrect: 0 } });

    const corrupt = createMemoryStore({
      [PROGRESS_STORAGE_KEY]: JSON.stringify({ hello: { quizCorrect: 9, quizAttempts: 2 }, bad: 'x', neg: { quizAttempts: -1 } }),
    });
    await expect(loadProgress(corrupt)).resolves.toEqual({
      hello: { learnedAt: null, quizAttempts: 2, quizCorrect: 2 },
      neg: { learnedAt: null, quizAttempts: 0, quizCorrect: 0 },
    });
  });
});
