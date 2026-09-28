import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/accessibility/useReduceMotion';
import { HistoryProvider } from '@/history/HistoryProvider';
import { MotionLibraryProvider } from '@/motion/MotionLibraryProvider';
import { PersonalSignsProvider } from '@/personal/PersonalSignsProvider';
import { AppThemeProvider } from '@/settings/AppThemeProvider';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { SignVocabularyProvider } from '@/signpack/SignVocabularyProvider';
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
          // The same smooth slide (with the previous screen easing back) on Android and iOS.
          animation: reduceMotion ? 'none' : Platform.OS === 'android' ? 'ios_from_right' : 'default',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('home.title') }} />
        <Stack.Screen
          name="welcome"
          options={{ headerShown: false, gestureEnabled: false, animation: reduceMotion ? 'none' : 'fade' }}
        />
        <Stack.Screen name="signs/index" options={{ title: t('screens.mySigns') }} />
        <Stack.Screen name="signs/[id]" options={{ title: t('screens.sign') }} />
        <Stack.Screen name="signs/teach" options={{ title: t('screens.teach') }} />
        <Stack.Screen name="history" options={{ title: t('screens.history') }} />
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
              <PersonalSignsProvider>
                <SignVocabularyProvider>
                  <MotionLibraryProvider>
                    <AppStack />
                  </MotionLibraryProvider>
                </SignVocabularyProvider>
              </PersonalSignsProvider>
            </HistoryProvider>
          </NavigationTheme>
        </AppThemeProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
