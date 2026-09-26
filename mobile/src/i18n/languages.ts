/**
 * Registry of languages the app knows about.
 *
 * `status` describes the UI translation:
 * - `complete`: reviewed by a native speaker; every key present.
 * - `draft`: every key present but awaiting native-speaker review (shown with a notice).
 * - `planned`: not yet translated; not selectable.
 *
 * `speechTag` is the BCP 47 tag passed to the device text-to-speech engine.
 */

export const LANGUAGE_CODES = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa'] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export type TranslationStatus = 'complete' | 'draft' | 'planned';

export interface LanguageInfo {
  code: LanguageCode;
  /** Name of the language written in that language, e.g. "हिन्दी". */
  nativeName: string;
  englishName: string;
  speechTag: string;
  status: TranslationStatus;
}

export const LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  en: { code: 'en', nativeName: 'English', englishName: 'English', speechTag: 'en-IN', status: 'complete' },
  hi: { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', speechTag: 'hi-IN', status: 'draft' },
  bn: { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', speechTag: 'bn-IN', status: 'planned' },
  ta: { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', speechTag: 'ta-IN', status: 'planned' },
  te: { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', speechTag: 'te-IN', status: 'planned' },
  mr: { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi', speechTag: 'mr-IN', status: 'planned' },
  gu: { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati', speechTag: 'gu-IN', status: 'planned' },
  kn: { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada', speechTag: 'kn-IN', status: 'planned' },
  ml: { code: 'ml', nativeName: 'മലയാളം', englishName: 'Malayalam', speechTag: 'ml-IN', status: 'planned' },
  pa: { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi', speechTag: 'pa-IN', status: 'planned' },
};

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function isSelectable(code: LanguageCode): boolean {
  return LANGUAGES[code].status !== 'planned';
}

/** Languages a user can pick for the app UI or output. */
export function selectableLanguages(): LanguageInfo[] {
  return LANGUAGE_CODES.map((code) => LANGUAGES[code]).filter((info) => info.status !== 'planned');
}

/** First device language we can display, otherwise English. */
export function resolveDeviceLanguage(deviceLocales: readonly { languageCode: string | null }[]): LanguageCode {
  for (const locale of deviceLocales) {
    const code = locale.languageCode?.toLowerCase();
    if (isLanguageCode(code) && isSelectable(code)) {
      return code;
    }
  }
  return DEFAULT_LANGUAGE;
}
