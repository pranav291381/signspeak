import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReferenceSign } from '@/personal/matcher';
import type { PersonalSign } from '@/personal/types';

import { createRecognitionSession, isDisplayableLabel, type SessionFactory } from './engine';
import type { RecognitionSession, SessionSnapshot } from './session';
import type { FrameSource, Recognition } from './types';

const MAX_RESULTS = 50;

interface Options {
  demoMode: boolean;
  /** Personal signs to recognize (recreates the session when they change). */
  signs?: readonly PersonalSign[];
  /** Sign-pack signs to recognize, instead of personal signs (recreates the session when they change). */
  vocabulary?: readonly ReferenceSign[];
  source?: FrameSource | null;
  /** Labels that may be shown; anything else is dropped. */
  isDisplayable?: (label: string) => boolean;
  /** False pauses recognition (screen hidden, app in background, user paused, camera not ready). */
  active: boolean;
  onRecognition?: (recognition: Recognition) => void;
  factory?: SessionFactory;
}

export interface RecognitionController {
  snapshot: SessionSnapshot | null;
  results: Recognition[];
  clear(): void;
  /** Recreate the session, e.g. after a model error. */
  restart(): void;
}

export function useRecognition({
  demoMode,
  signs,
  vocabulary,
  source,
  isDisplayable = isDisplayableLabel,
  active,
  onRecognition,
  factory = createRecognitionSession,
}: Options): RecognitionController {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [results, setResults] = useState<Recognition[]>([]);
  const [attempt, setAttempt] = useState(0);
  const sessionRef = useRef<RecognitionSession | null>(null);
  const onRecognitionRef = useRef(onRecognition);
  const isDisplayableRef = useRef(isDisplayable);

  useEffect(() => {
    onRecognitionRef.current = onRecognition;
    isDisplayableRef.current = isDisplayable;
  }, [onRecognition, isDisplayable]);

  useEffect(() => {
    const session = factory({ demoMode, signs, vocabulary, source });
    sessionRef.current = session;
    const unsubscribe = session.subscribe({
      onSnapshot: setSnapshot,
      onRecognition: (recognition) => {
        if (!isDisplayableRef.current(recognition.label)) return;
        setResults((prev) => [...prev, recognition].slice(-MAX_RESULTS));
        onRecognitionRef.current?.(recognition);
      },
    });
    void session.start();
    return () => {
      unsubscribe();
      session.stop();
      sessionRef.current = null;
    };
  }, [demoMode, signs, vocabulary, source, factory, attempt]);

  const state = snapshot?.state;
  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (active && state === 'paused') session.resume();
    if (!active && state === 'running') session.pause();
  }, [active, state]);

  const clear = useCallback(() => {
    setResults([]);
    sessionRef.current?.resetEvidence();
  }, []);

  const restart = useCallback(() => setAttempt((n) => n + 1), []);

  return { snapshot, results, clear, restart };
}
