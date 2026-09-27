import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();

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
          // Each tab is a 28dp icon plus Inter's 14dp label inside 5dp padding;
          // the default 49dp bar clips the label. Keep the home-indicator inset.
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom,
          ...elevation.raised,
        },
        tabBarLabelStyle: {
          fontFamily: typography.label.fontFamily,
          fontWeight: typography.label.fontWeight,
          fontSize: 11,
          lineHeight: 14,
        },
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
