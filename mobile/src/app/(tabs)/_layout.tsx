import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { Icon, type IconName } from '@/components';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

const TAB_ICONS: Record<string, [IconName, IconName]> = {
  index: ['home-variant', 'home-variant-outline'],
  'sign-to-text': ['hand-wave', 'hand-wave-outline'],
  'text-to-isl': ['message-text', 'message-text-outline'],
  learn: ['school', 'school-outline'],
  settings: ['cog', 'cog-outline'],
};

export default function TabsLayout() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { colors, elevation, typography } = useTheme();

  // First launch: choose language and appearance before anything else.
  if (!settings.onboardingComplete) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          ...elevation.raised,
        },
        tabBarLabelStyle: { fontFamily: typography.label.fontFamily, fontSize: 11.5 },
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = TAB_ICONS[route.name] ?? ['circle', 'circle-outline'];
          return <Icon name={focused ? active : inactive} color={String(color)} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen
        name="sign-to-text"
        options={{ title: t('tabs.signToText'), tabBarAccessibilityLabel: t('home.signToText.a11yLabel') }}
      />
      <Tabs.Screen
        name="text-to-isl"
        options={{ title: t('tabs.textToIsl'), tabBarAccessibilityLabel: t('home.textToIsl.a11yLabel') }}
      />
      <Tabs.Screen name="learn" options={{ title: t('tabs.learn'), tabBarAccessibilityLabel: t('home.learn.a11yLabel') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings') }} />
    </Tabs>
  );
}
