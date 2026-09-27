import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { loadBundledPacks, type PackLoader } from './loader';
import { buildVocabulary, type Vocabulary } from './vocabulary';

export type VocabularyState =
  | { status: 'idle' | 'loading' }
  /** No sign pack is installed (or none could be read). */
  | { status: 'empty'; failed: string[] }
  | { status: 'ready'; vocabulary: Vocabulary; failed: string[] };

interface VocabularyValue {
  state: VocabularyState;
  /** Starts loading the installed packs, once. */
  request(): void;
}

const VocabularyContext = createContext<VocabularyValue | null>(null);

/**
 * The sign vocabulary from installed sign packs. Packs can be large, so they are
 * read only when a screen asks for them (Sign → Text), not at app start.
 */
export function SignVocabularyProvider({ children, load = loadBundledPacks }: { children: ReactNode; load?: PackLoader }) {
  const [state, setState] = useState<VocabularyState>({ status: 'idle' });
  const started = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const request = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState({ status: 'loading' });
    load()
      .catch(() => ({ packs: [], failed: ['all'] }))
      .then(({ packs, failed }) => {
        if (!mounted.current) return;
        const vocabulary = buildVocabulary(packs);
        setState(vocabulary.size > 0 ? { status: 'ready', vocabulary, failed } : { status: 'empty', failed });
      });
  }, [load]);

  const value = useMemo(() => ({ state, request }), [state, request]);
  return <VocabularyContext.Provider value={value}>{children}</VocabularyContext.Provider>;
}

/** The installed sign vocabulary; loads it on first use. */
export function useSignVocabulary(): VocabularyState {
  const value = useContext(VocabularyContext);
  if (!value) throw new Error('useSignVocabulary must be used inside <SignVocabularyProvider>');
  const { request, state } = value;
  useEffect(request, [request]);
  return state;
}
