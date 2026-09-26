import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/accessibility/useReduceMotion';
import { HistoryProvider } from '@/history/HistoryProvider';
import { ProgressProvider } from '@/learn/ProgressProvider';
import { AppThemeProvider } from '@/settings/AppThemeProvider';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';
import { APP_FONTS } from '@/theme/fonts';

/** Gives headers, tab bar and screen backgrounds the app's colours. */
function NavigationTheme({ children }: { children: ReactNode }) {
  const { colors, scheme } = useTheme();
  const theme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [colors, scheme]);
  return (
    <NavigationThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </NavigationThemeProvider>
  );
}

function AppStack() {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: 17, fontFamily: typography.heading.fontFamily, fontWeight: typography.heading.fontWeight },
          contentStyle: { backgroundColor: colors.background },
          animation: reduceMotion ? 'none' : 'default',
        }}
      >
        <Stack.Screen name="index" options={{ title: t('home.title') }} />
        <Stack.Screen name="sign-to-text" options={{ title: t('screens.signToText') }} />
        <Stack.Screen name="text-to-isl" options={{ title: t('screens.textToIsl') }} />
        <Stack.Screen name="learn/index" options={{ title: t('screens.learn') }} />
        <Stack.Screen name="learn/[category]" options={{ title: t('screens.learn') }} />
        <Stack.Screen name="learn/sign/[id]" options={{ title: t('screens.lesson') }} />
        <Stack.Screen name="learn/quiz/[category]" options={{ title: t('screens.quiz') }} />
        <Stack.Screen name="history" options={{ title: t('screens.history') }} />
        <Stack.Screen name="settings" options={{ title: t('screens.settings') }} />
        <Stack.Screen name="feedback" options={{ title: t('screens.feedback') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(APP_FONTS);
  // Wait briefly for the bundled font so text does not re-flow; fall back to the system font on error.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AppThemeProvider customFont={!fontError}>
          <NavigationTheme>
            <HistoryProvider>
              <ProgressProvider>
                <AppStack />
              </ProgressProvider>
            </HistoryProvider>
          </NavigationTheme>
        </AppThemeProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
