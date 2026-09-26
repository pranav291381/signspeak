import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/accessibility/useReduceMotion';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

function AppStack() {
  const { t } = useTranslation();
  const { colors, scheme, typography } = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: typography.heading.fontSize, fontWeight: typography.heading.fontWeight },
          contentStyle: { backgroundColor: colors.background },
          animation: reduceMotion ? 'none' : 'default',
        }}
      >
        <Stack.Screen name="index" options={{ title: t('home.title') }} />
        <Stack.Screen name="sign-to-text" options={{ title: t('screens.signToText') }} />
        <Stack.Screen name="text-to-isl" options={{ title: t('screens.textToIsl') }} />
        <Stack.Screen name="learn/index" options={{ title: t('screens.learn') }} />
        <Stack.Screen name="history" options={{ title: t('screens.history') }} />
        <Stack.Screen name="settings" options={{ title: t('screens.settings') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AppStack />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
