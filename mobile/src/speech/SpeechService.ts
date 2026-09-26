import { LANGUAGES, type LanguageCode } from '@/i18n/languages';

export type SpeakResult =
  | { status: 'ok' }
  | { status: 'stopped' }
  | { status: 'empty_text' }
  /** Voices are installed, but none for this language: we do not speak with the wrong voice. */
  | { status: 'unsupported_language' }
  /** No text-to-speech engine or voices on this device. */
  | { status: 'engine_unavailable' }
  | { status: 'error'; message: string };

export interface EngineVoice {
  language: string;
}

/** Thin adapter over the platform TTS (see expoSpeechEngine.ts), so the service is testable. */
export interface SpeechEngine {
  speak(
    text: string,
    options: {
      language: string;
      rate: number;
      onDone: () => void;
      onStopped: () => void;
      onError: (error: Error) => void;
    },
  ): void;
  stop(): Promise<void>;
  getVoices(): Promise<EngineVoice[]>;
}

/** "hi_IN" / "hi-in" / "hi" -> "hi" */
function baseLanguage(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0] ?? '';
}

/**
 * speak(text, language) with explicit outcomes. Speech is always an addition to
 * on-screen text, never the only way information is given.
 */
export class SpeechService {
  private voices: Promise<EngineVoice[]> | null = null;

  constructor(private readonly engine: SpeechEngine) {}

  private loadVoices(): Promise<EngineVoice[]> {
    if (!this.voices) {
      this.voices = this.engine.getVoices().catch(() => []);
    }
    return this.voices;
  }

  /** Forget cached voices (e.g. after the user installs a new voice). */
  refreshVoices(): void {
    this.voices = null;
  }

  /**
   * `true`/`false` when the device reports its voices; `null` when it reports
   * none (some Android engines only list voices after first use).
   */
  async isLanguageSupported(language: LanguageCode): Promise<boolean | null> {
    const voices = await this.loadVoices();
    if (voices.length === 0) return null;
    return voices.some((v) => baseLanguage(v.language) === language);
  }

  async speak(text: string, language: LanguageCode, rate = 1): Promise<SpeakResult> {
    const trimmed = text.trim();
    if (!trimmed) return { status: 'empty_text' };

    const supported = await this.isLanguageSupported(language);
    if (supported === false) return { status: 'unsupported_language' };

    await this.engine.stop().catch(() => undefined);
    return new Promise<SpeakResult>((resolve) => {
      try {
        this.engine.speak(trimmed, {
          language: LANGUAGES[language].speechTag,
          rate,
          onDone: () => resolve({ status: 'ok' }),
          onStopped: () => resolve({ status: 'stopped' }),
          onError: (error) =>
            resolve(supported === null ? { status: 'engine_unavailable' } : { status: 'error', message: error.message }),
        });
      } catch {
        resolve({ status: 'engine_unavailable' });
      }
    });
  }

  stop(): Promise<void> {
    return this.engine.stop().catch(() => undefined);
  }
}
