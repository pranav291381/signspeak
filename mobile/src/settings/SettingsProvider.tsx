import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { deviceLanguage, initI18n, type LanguageCode } from '@/i18n';
import { deviceStore, type KeyValueStore } from '@/storage/keyValueStore';

import { defaultSettings, loadSettings, saveSettings, type Settings } from './settings';

interface SettingsContextValue {
  settings: Settings;
  updateSettings(patch: Partial<Settings>): void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface Props {
  children: ReactNode;
  store?: KeyValueStore;
  /** Overrides device language detection (tests, NGO deployments). */
  initialLanguage?: LanguageCode;
}

/**
 * Loads persisted settings before rendering children, so the first screen is
 * already in the user's language. Loading is a single local read.
 */
export function SettingsProvider({ children, store = deviceStore, initialLanguage }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    const defaults = defaultSettings(initialLanguage ?? deviceLanguage());
    loadSettings(store, defaults).then((loaded) => {
      if (cancelled) return;
      initI18n(loaded.appLanguage);
      setSettings(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [store, initialLanguage]);

  const appLanguage = settings?.appLanguage;
  useEffect(() => {
    if (appLanguage) initI18n(appLanguage);
  }, [appLanguage]);

  useEffect(() => {
    if (!settings) return;
    saveSettings(store, settings).catch((error: unknown) => {
      // Settings still apply for this session; failing to persist is not fatal.
      console.warn('Could not save settings', error);
    });
  }, [store, settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo(() => (settings ? { settings, updateSettings } : null), [settings, updateSettings]);

  if (!value) {
    return null;
  }
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings must be used inside <SettingsProvider>');
  }
  return value;
}
