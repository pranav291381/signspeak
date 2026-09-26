import { readJson, type KeyValueStore } from '@/storage/keyValueStore';

export const PROGRESS_STORAGE_KEY = 'islconnect.progress.v1';

/** Learning progress for one sign. Stored on this device only. */
export interface SignProgress {
  learnedAt: number | null;
  quizCorrect: number;
  quizAttempts: number;
}

export type ProgressMap = Record<string, SignProgress>;

export const EMPTY_PROGRESS: SignProgress = { learnedAt: null, quizCorrect: 0, quizAttempts: 0 };

function sanitizeEntry(value: unknown): SignProgress | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const count = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0);
  const attempts = count(v.quizAttempts);
  return {
    learnedAt: typeof v.learnedAt === 'number' ? v.learnedAt : null,
    quizAttempts: attempts,
    quizCorrect: Math.min(count(v.quizCorrect), attempts),
  };
}

export async function loadProgress(store: KeyValueStore): Promise<ProgressMap> {
  const raw = await readJson(store, PROGRESS_STORAGE_KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ProgressMap = {};
  for (const [id, value] of Object.entries(raw)) {
    const entry = sanitizeEntry(value);
    if (entry) out[id] = entry;
  }
  return out;
}

export async function saveProgress(store: KeyValueStore, progress: ProgressMap): Promise<void> {
  await store.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function setLearned(progress: ProgressMap, id: string, learned: boolean, now: number): ProgressMap {
  const current = progress[id] ?? EMPTY_PROGRESS;
  return { ...progress, [id]: { ...current, learnedAt: learned ? now : null } };
}

export function recordQuizAnswer(progress: ProgressMap, id: string, correct: boolean): ProgressMap {
  const current = progress[id] ?? EMPTY_PROGRESS;
  return {
    ...progress,
    [id]: { ...current, quizAttempts: current.quizAttempts + 1, quizCorrect: current.quizCorrect + (correct ? 1 : 0) },
  };
}

export function learnedCount(progress: ProgressMap, ids: readonly string[]): number {
  return ids.filter((id) => progress[id]?.learnedAt != null).length;
}
