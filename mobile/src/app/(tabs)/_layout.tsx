import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { useReduceMotion } from '@/accessibility/useReduceMotion';
import { FloatingTabBar } from '@/navigation/FloatingTabBar';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

  // First launch: choose language and appearance before anything else.
  if (!settings.onboardingComplete) return <Redirect href="/welcome" />;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Switching tabs slides the screens slightly and cross-fades them.
        animation: reduceMotion ? 'none' : 'shift',
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarButtonTestID: 'tab-home' }} />
      <Tabs.Screen
        name="sign-to-text"
        options={{
          title: t('tabs.signToText'),
          tabBarAccessibilityLabel: t('home.signToText.a11yLabel'),
          tabBarButtonTestID: 'tab-sign-to-text',
        }}
      />
      <Tabs.Screen
        name="text-to-isl"
        options={{
          title: t('tabs.textToIsl'),
          tabBarAccessibilityLabel: t('home.textToIsl.a11yLabel'),
          tabBarButtonTestID: 'tab-text-to-isl',
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{ title: t('tabs.learn'), tabBarAccessibilityLabel: t('home.learn.a11yLabel'), tabBarButtonTestID: 'tab-learn' }}
      />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarButtonTestID: 'tab-settings' }} />
    </Tabs>
  );
}
