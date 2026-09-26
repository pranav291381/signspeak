import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { HistoryProvider } from '@/history/HistoryProvider';
import type { LanguageCode } from '@/i18n';
import { PersonalSignsProvider } from '@/personal/PersonalSignsProvider';
import { AppThemeProvider } from '@/settings/AppThemeProvider';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { createMemoryStore, type KeyValueStore } from '@/storage/keyValueStore';

interface Options extends RenderOptions {
  store?: KeyValueStore;
  language?: LanguageCode;
}

/** Renders `ui` inside the app providers with in-memory storage. */
export function renderWithProviders(ui: ReactElement, { store, language = 'en', ...options }: Options = {}) {
  const memoryStore = store ?? createMemoryStore();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SettingsProvider store={memoryStore} initialLanguage={language}>
        <AppThemeProvider>
          <HistoryProvider store={memoryStore}>
            <PersonalSignsProvider store={memoryStore}>{children}</PersonalSignsProvider>
          </HistoryProvider>
        </AppThemeProvider>
      </SettingsProvider>
    );
  }
  return { store: memoryStore, ...render(ui, { wrapper: Wrapper, ...options }) };
}
