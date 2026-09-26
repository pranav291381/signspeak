import { isLanguageCode, isSelectable, type LanguageCode } from '@/i18n/languages';
import { readJson, type KeyValueStore } from '@/storage/keyValueStore';
import type { ThemePreference } from '@/theme';

export type CameraFacing = 'front' | 'back';
export type SpeechRate = 'slow' | 'normal' | 'fast';

export interface Settings {
  /** Language of menus and buttons. */
  appLanguage: LanguageCode;
  /** Language of recognised text and speech. Independent of `appLanguage`. */
  outputLanguage: LanguageCode;
  autoSpeak: boolean;
  speechRate: SpeechRate;
  defaultCamera: CameraFacing;
  /** Off by default: conversation text is sensitive and phones may be shared. */
  historyEnabled: boolean;
  hapticsEnabled: boolean;
  /** Simulated recognition for demonstrations. Never on by default. */
  demoMode: boolean;
  /** Light, dark, or follow the phone. */
  theme: ThemePreference;
  /** False until the first-launch welcome (language + appearance) has been completed. */
  onboardingComplete: boolean;
}

export const SETTINGS_STORAGE_KEY = 'islconnect.settings.v1';

export const SPEECH_RATE_VALUES: Record<SpeechRate, number> = {
  slow: 0.75,
  normal: 1,
  fast: 1.25,
};

export function defaultSettings(language: LanguageCode): Settings {
  return {
    appLanguage: language,
    outputLanguage: language,
    autoSpeak: false,
    speechRate: 'normal',
    // The phone is usually pointed at the signer, so the back camera is the default.
    defaultCamera: 'back',
    historyEnabled: false,
    hapticsEnabled: true,
    demoMode: false,
    theme: 'system',
    onboardingComplete: false,
  };
}

function pickLanguage(value: unknown, fallback: LanguageCode): LanguageCode {
  return isLanguageCode(value) && isSelectable(value) ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Accepts anything (e.g. JSON from an older app version) and returns valid settings. */
export function sanitizeSettings(raw: unknown, defaults: Settings): Settings {
  if (raw == null || typeof raw !== 'object') {
    return defaults;
  }
  const r = raw as Record<string, unknown>;
  return {
    appLanguage: pickLanguage(r.appLanguage, defaults.appLanguage),
    outputLanguage: pickLanguage(r.outputLanguage, defaults.outputLanguage),
    autoSpeak: pickBoolean(r.autoSpeak, defaults.autoSpeak),
    speechRate: pickOneOf(r.speechRate, ['slow', 'normal', 'fast'], defaults.speechRate),
    defaultCamera: pickOneOf(r.defaultCamera, ['front', 'back'], defaults.defaultCamera),
    historyEnabled: pickBoolean(r.historyEnabled, defaults.historyEnabled),
    hapticsEnabled: pickBoolean(r.hapticsEnabled, defaults.hapticsEnabled),
    demoMode: pickBoolean(r.demoMode, defaults.demoMode),
    theme: pickOneOf(r.theme, ['system', 'light', 'dark'], defaults.theme),
    onboardingComplete: pickBoolean(r.onboardingComplete, defaults.onboardingComplete),
  };
}

export async function loadSettings(store: KeyValueStore, defaults: Settings): Promise<Settings> {
  return sanitizeSettings(await readJson(store, SETTINGS_STORAGE_KEY), defaults);
}

export async function saveSettings(store: KeyValueStore, settings: Settings): Promise<void> {
  await store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
