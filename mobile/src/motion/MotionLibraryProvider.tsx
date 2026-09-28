import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { readAssetText } from '@/signpack/loader';
import { parseSignPack } from '@/signpack/parse';
import type { SignPack } from '@/signpack/types';

import { BUNDLED_MOTION_PACKS, type BundledMotionPack } from './bundled';
import { buildMotionLibrary, type MotionLibrary } from './library';

export type MotionLibraryState =
  | { status: 'idle' | 'loading' }
  /** No motion pack could be read. */
  | { status: 'empty' }
  | { status: 'ready'; library: MotionLibrary };

export type MotionPackLoader = () => Promise<SignPack[]>;

/** Reads every bundled motion pack; one that cannot be read is left out. */
export async function loadMotionPacks(
  bundled: readonly BundledMotionPack[] = BUNDLED_MOTION_PACKS,
  read: (module: number) => Promise<string> = readAssetText,
): Promise<SignPack[]> {
  const packs: SignPack[] = [];
  for (const entry of bundled) {
    try {
      packs.push(parseSignPack(JSON.parse(await read(entry.asset))).pack);
    } catch {
      // Left out: the screen says when nothing could be read.
    }
  }
  return packs;
}

interface MotionLibraryValue {
  state: MotionLibraryState;
  request(): void;
}

const MotionLibraryContext = createContext<MotionLibraryValue | null>(null);

/** Recorded signs for Text → ISL, read the first time a screen asks for them. */
export function MotionLibraryProvider({ children, load = loadMotionPacks }: { children: ReactNode; load?: MotionPackLoader }) {
  const [state, setState] = useState<MotionLibraryState>({ status: 'idle' });
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
      .catch(() => [])
      .then((packs) => {
        if (!mounted.current) return;
        const library = buildMotionLibrary(packs);
        setState(library.signs.length > 0 ? { status: 'ready', library } : { status: 'empty' });
      });
  }, [load]);

  const value = useMemo(() => ({ state, request }), [state, request]);
  return <MotionLibraryContext.Provider value={value}>{children}</MotionLibraryContext.Provider>;
}

/** The recorded signs; starts loading them on first use. */
export function useMotionLibrary(): MotionLibraryState {
  const value = useContext(MotionLibraryContext);
  if (!value) throw new Error('useMotionLibrary must be used inside <MotionLibraryProvider>');
  const { request, state } = value;
  useEffect(request, [request]);
  return state;
}
