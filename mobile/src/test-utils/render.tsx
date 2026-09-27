import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { HistoryProvider } from '@/history/HistoryProvider';
import type { LanguageCode } from '@/i18n';
import { PersonalSignsProvider } from '@/personal/PersonalSignsProvider';
import { AppThemeProvider } from '@/settings/AppThemeProvider';
import { SettingsProvider } from '@/settings/SettingsProvider';
import type { PackLoader } from '@/signpack/loader';
import { SignVocabularyProvider } from '@/signpack/SignVocabularyProvider';
import type { SignPack } from '@/signpack/types';
import { createMemoryStore, type KeyValueStore } from '@/storage/keyValueStore';

interface Options extends RenderOptions {
  store?: KeyValueStore;
  language?: LanguageCode;
  /** Installed sign packs (none by default). */
  packs?: SignPack[];
  /** Replaces reading `packs`, e.g. to keep the vocabulary loading. */
  loadPacks?: PackLoader;
}

/** Renders `ui` inside the app providers with in-memory storage. */
export function renderWithProviders(ui: ReactElement, { store, language = 'en', packs = [], loadPacks, ...options }: Options = {}) {
  const memoryStore = store ?? createMemoryStore();
  const load = loadPacks ?? (() => Promise.resolve({ packs, failed: [] }));
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SettingsProvider store={memoryStore} initialLanguage={language}>
        <AppThemeProvider>
          <HistoryProvider store={memoryStore}>
            <PersonalSignsProvider store={memoryStore}>
              <SignVocabularyProvider load={load}>{children}</SignVocabularyProvider>
            </PersonalSignsProvider>
          </HistoryProvider>
        </AppThemeProvider>
      </SettingsProvider>
    );
  }
  return { store: memoryStore, ...render(ui, { wrapper: Wrapper, ...options }) };
}
