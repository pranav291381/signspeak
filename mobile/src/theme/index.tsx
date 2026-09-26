import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, makeTheme, type ColorScheme, type Theme } from './tokens';

export * from './tokens';

/** What the user chose in Settings; `system` follows the phone's light/dark setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

const ThemeContext = createContext<Theme | null>(null);

export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

interface Props {
  preference: ThemePreference;
  /** False when the bundled font could not be loaded: use the system font. */
  customFont?: boolean;
  children: ReactNode;
}

export function ThemeProvider({ preference, customFont = true, children }: Props) {
  const system = useColorScheme();
  const scheme = resolveScheme(preference, system);
  const theme = useMemo(() => makeTheme(scheme, customFont), [scheme, customFont]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** The active theme; outside a ThemeProvider it follows the system setting. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  const system = useColorScheme();
  return theme ?? (system === 'dark' ? darkTheme : lightTheme);
}
