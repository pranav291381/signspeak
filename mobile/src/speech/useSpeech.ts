import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { useSettings } from '@/settings/SettingsProvider';
import { SPEECH_RATE_VALUES } from '@/settings/settings';

import { expoSpeechEngine } from './expoSpeechEngine';
import { SpeechService, type SpeakResult } from './SpeechService';

const defaultService = new SpeechService(expoSpeechEngine);

/** Override in tests or to plug in another engine. */
export const SpeechServiceContext = createContext<SpeechService>(defaultService);

export interface SpeechController {
  speak(text: string): Promise<SpeakResult>;
  stop(): void;
  speaking: boolean;
  /** Last failure, cleared on the next attempt. */
  problem: SpeakResult | null;
}

/** Speaks in the user's output language and speed. */
export function useSpeech(): SpeechController {
  const service = useContext(SpeechServiceContext);
  const { settings } = useSettings();
  const [speaking, setSpeaking] = useState(false);
  const [problem, setProblem] = useState<SpeakResult | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void service.stop();
    };
  }, [service]);

  const speak = useCallback(
    async (text: string) => {
      setProblem(null);
      setSpeaking(true);
      const result = await service.speak(text, settings.outputLanguage, SPEECH_RATE_VALUES[settings.speechRate]);
      if (mounted.current) {
        setSpeaking(false);
        if (result.status !== 'ok' && result.status !== 'stopped') setProblem(result);
      }
      return result;
    },
    [service, settings.outputLanguage, settings.speechRate],
  );

  const stop = useCallback(() => {
    void service.stop();
  }, [service]);

  return { speak, stop, speaking, problem };
}
