import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { deviceStore, type KeyValueStore } from '@/storage/keyValueStore';

import {
  loadProgress,
  PROGRESS_STORAGE_KEY,
  recordQuizAnswer as recordAnswer,
  saveProgress,
  setLearned as markLearned,
  type ProgressMap,
} from './progress';

interface ProgressContextValue {
  progress: ProgressMap;
  setLearned(id: string, learned: boolean): void;
  recordQuizAnswer(id: string, correct: boolean): void;
  reset(): void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children, store = deviceStore }: { children: ReactNode; store?: KeyValueStore }) {
  const [progress, setProgress] = useState<ProgressMap>({});

  useEffect(() => {
    let cancelled = false;
    loadProgress(store).then((loaded) => {
      if (!cancelled) setProgress(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const update = useCallback(
    (fn: (current: ProgressMap) => ProgressMap) => {
      setProgress((current) => {
        const next = fn(current);
        saveProgress(store, next).catch(() => undefined);
        return next;
      });
    },
    [store],
  );

  const setLearned = useCallback(
    (id: string, learned: boolean) => update((p) => markLearned(p, id, learned, Date.now())),
    [update],
  );
  const recordQuizAnswer = useCallback((id: string, correct: boolean) => update((p) => recordAnswer(p, id, correct)), [update]);
  const reset = useCallback(() => {
    setProgress({});
    store.removeItem(PROGRESS_STORAGE_KEY).catch(() => undefined);
  }, [store]);

  const value = useMemo(
    () => ({ progress, setLearned, recordQuizAnswer, reset }),
    [progress, setLearned, recordQuizAnswer, reset],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const value = useContext(ProgressContext);
  if (!value) throw new Error('useProgress must be used inside <ProgressProvider>');
  return value;
}
