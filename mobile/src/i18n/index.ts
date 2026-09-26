import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_LANGUAGE, resolveDeviceLanguage, type LanguageCode } from './languages';
import { resources } from './resources';

export * from './languages';

/** The app's i18next instance (registered with react-i18next on init). */
export const i18n = createInstance();

export function deviceLanguage(): LanguageCode {
  try {
    return resolveDeviceLanguage(getLocales());
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Initialise i18next synchronously (resources are bundled), or switch language
 * if it is already initialised. Safe to call repeatedly.
 */
export function initI18n(language: LanguageCode = deviceLanguage()): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      defaultNS: 'common',
      ns: ['common'],
      initAsync: false,
      returnNull: false,
      returnEmptyString: false,
      interpolation: { escapeValue: false },
    });
  } else if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
  return i18n;
}
