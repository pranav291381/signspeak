import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { HistoryProvider } from '@/history/HistoryProvider';
import type { LanguageCode } from '@/i18n';
import { MotionLibraryProvider, type MotionPackLoader } from '@/motion/MotionLibraryProvider';
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
  /** Motion packs for Text → ISL (none by default). */
  motionPacks?: SignPack[];
  /** Replaces reading `motionPacks`. */
  loadMotions?: MotionPackLoader;
}

/** Renders `ui` inside the app providers with in-memory storage. */
export function renderWithProviders(
  ui: ReactElement,
  { store, language = 'en', packs = [], loadPacks, motionPacks = [], loadMotions, ...options }: Options = {},
) {
  const memoryStore = store ?? createMemoryStore();
  const load = loadPacks ?? (() => Promise.resolve({ packs, failed: [] }));
  const loadMotionPacks = loadMotions ?? (() => Promise.resolve(motionPacks));
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SettingsProvider store={memoryStore} initialLanguage={language}>
        <AppThemeProvider>
          <HistoryProvider store={memoryStore}>
            <PersonalSignsProvider store={memoryStore}>
              <SignVocabularyProvider load={load}>
                <MotionLibraryProvider load={loadMotionPacks}>{children}</MotionLibraryProvider>
              </SignVocabularyProvider>
            </PersonalSignsProvider>
          </HistoryProvider>
        </AppThemeProvider>
      </SettingsProvider>
    );
  }
  return { store: memoryStore, ...render(ui, { wrapper: Wrapper, ...options }) };
}
