import type { ReactNode } from 'react';

import { ThemeProvider } from '@/theme';

import { useSettings } from './SettingsProvider';

/** Applies the appearance chosen in Settings (system, light or dark). */
export function AppThemeProvider({ customFont = true, children }: { customFont?: boolean; children: ReactNode }) {
  const { settings } = useSettings();
  return (
    <ThemeProvider preference={settings.theme} customFont={customFont}>
      {children}
    </ThemeProvider>
  );
}
