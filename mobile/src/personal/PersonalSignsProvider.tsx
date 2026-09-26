import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { deviceStore, type KeyValueStore } from '@/storage/keyValueStore';

import { deleteAllSigns, deleteSign, loadSigns, saveSign, signIdFor, withSample } from './store';
import { MIN_SAMPLES_FOR_RECOGNITION, type PersonalSign, type SignTarget } from './types';

interface PersonalSignsValue {
  /** False until the saved signs have been read. */
  ready: boolean;
  signs: PersonalSign[];
  /** Signs with enough recordings to be recognized. */
  recognizable: PersonalSign[];
  get(id: string): PersonalSign | undefined;
  /** Adds one recording; resolves to the updated sign. Rejects if it could not be saved. */
  addSample(target: SignTarget, frames: readonly Float32Array[]): Promise<PersonalSign>;
  removeSample(id: string, index: number): Promise<void>;
  remove(id: string): Promise<void>;
  removeAll(): Promise<void>;
}

const PersonalSignsContext = createContext<PersonalSignsValue | null>(null);

export function PersonalSignsProvider({ children, store = deviceStore }: { children: ReactNode; store?: KeyValueStore }) {
  const [signs, setSigns] = useState<PersonalSign[]>([]);
  const [ready, setReady] = useState(false);
  // Latest list for async writers, so two quick saves never lose one another.
  const current = useRef<PersonalSign[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadSigns(store)
      .catch(() => [])
      .then((loaded) => {
        if (cancelled) return;
        current.current = loaded;
        setSigns(loaded);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const commit = useCallback((next: PersonalSign[]) => {
    current.current = next;
    setSigns(next);
  }, []);

  const addSample = useCallback(
    async (target: SignTarget, frames: readonly Float32Array[]) => {
      const id = signIdFor(target);
      const list = current.current;
      const updated = withSample(
        list.find((s) => s.id === id),
        target,
        frames,
      );
      await saveSign(
        store,
        updated,
        list.map((s) => s.id),
      );
      commit(list.some((s) => s.id === id) ? list.map((s) => (s.id === id ? updated : s)) : [...list, updated]);
      return updated;
    },
    [store, commit],
  );

  const remove = useCallback(
    async (id: string) => {
      const list = current.current;
      await deleteSign(
        store,
        id,
        list.map((s) => s.id),
      );
      commit(list.filter((s) => s.id !== id));
    },
    [store, commit],
  );

  const removeSample = useCallback(
    async (id: string, index: number) => {
      const list = current.current;
      const sign = list.find((s) => s.id === id);
      if (!sign) return;
      if (sign.samples.length <= 1) {
        await remove(id);
        return;
      }
      const updated = { ...sign, samples: sign.samples.filter((_, i) => i !== index), updatedAt: new Date().toISOString() };
      await saveSign(
        store,
        updated,
        list.map((s) => s.id),
      );
      commit(list.map((s) => (s.id === id ? updated : s)));
    },
    [store, commit, remove],
  );

  const removeAll = useCallback(async () => {
    const ids = current.current.map((s) => s.id);
    commit([]);
    await deleteAllSigns(store, ids);
  }, [store, commit]);

  const value = useMemo<PersonalSignsValue>(() => {
    const byId = new Map(signs.map((s) => [s.id, s]));
    return {
      ready,
      signs,
      recognizable: signs.filter((s) => s.samples.length >= MIN_SAMPLES_FOR_RECOGNITION),
      get: (id) => byId.get(id),
      addSample,
      removeSample,
      remove,
      removeAll,
    };
  }, [ready, signs, addSample, removeSample, remove, removeAll]);

  return <PersonalSignsContext.Provider value={value}>{children}</PersonalSignsContext.Provider>;
}

export function usePersonalSigns(): PersonalSignsValue {
  const value = useContext(PersonalSignsContext);
  if (!value) throw new Error('usePersonalSigns must be used inside <PersonalSignsProvider>');
  return value;
}
