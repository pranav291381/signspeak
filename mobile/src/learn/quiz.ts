import { hasVerifiedDemonstration } from '@/content/library';
import type { SignEntry } from '@/content/types';

/**
 * Quiz: "watch the demonstration, choose the meaning".
 *
 * Only signs with a *verified* demonstration can be asked about or used as
 * answer options, so a quiz can never teach unverified ISL.
 */

export interface QuizQuestion {
  signId: string;
  optionIds: string[];
  answerIndex: number;
}

export type QuizBuild =
  | { status: 'ready'; questions: QuizQuestion[] }
  | { status: 'unavailable'; reason: 'not_enough_verified_content'; verifiedCount: number; required: number };

export interface QuizOptions {
  questionCount?: number;
  optionCount?: number;
  /** Returns a number in [0, 1). Injected for deterministic tests. */
  random?: () => number;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function buildQuiz(signs: readonly SignEntry[], options: QuizOptions = {}): QuizBuild {
  const { questionCount = 5, optionCount = 4, random = Math.random } = options;
  const eligible = signs.filter(hasVerifiedDemonstration);
  if (eligible.length < optionCount) {
    return { status: 'unavailable', reason: 'not_enough_verified_content', verifiedCount: eligible.length, required: optionCount };
  }
  const targets = shuffle(eligible, random).slice(0, Math.min(questionCount, eligible.length));
  const questions = targets.map((target) => {
    const distractors = shuffle(
      eligible.filter((s) => s.id !== target.id),
      random,
    ).slice(0, optionCount - 1);
    const answerIndex = Math.floor(random() * optionCount);
    const optionIds = distractors.map((s) => s.id);
    optionIds.splice(answerIndex, 0, target.id);
    return { signId: target.id, optionIds, answerIndex };
  });
  return { status: 'ready', questions };
}

export function scoreQuiz(questions: readonly QuizQuestion[], answers: readonly (number | null)[]): number {
  return questions.reduce((n, q, i) => n + (answers[i] === q.answerIndex ? 1 : 0), 0);
}
