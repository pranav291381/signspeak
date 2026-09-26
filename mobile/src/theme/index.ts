import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './tokens';

export * from './tokens';

/** Follows the system light/dark setting. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
