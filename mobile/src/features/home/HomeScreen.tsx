import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, NavCard, Notice, Screen, type IconName } from '@/components';

interface Destination {
  href: Href;
  icon: IconName;
  title: string;
  description: string;
  a11yLabel?: string;
  testID: string;
}

export function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const destinations: Destination[] = [
    {
      href: '/sign-to-text',
      icon: 'camera-outline',
      title: t('home.signToText.title'),
      a11yLabel: t('home.signToText.a11yLabel'),
      description: t('home.signToText.description'),
      testID: 'home-sign-to-text',
    },
    {
      href: '/text-to-isl',
      icon: 'keyboard-outline',
      title: t('home.textToIsl.title'),
      a11yLabel: t('home.textToIsl.a11yLabel'),
      description: t('home.textToIsl.description'),
      testID: 'home-text-to-isl',
    },
    {
      href: '/learn',
      icon: 'school-outline',
      title: t('home.learn.title'),
      a11yLabel: t('home.learn.a11yLabel'),
      description: t('home.learn.description'),
      testID: 'home-learn',
    },
    {
      href: '/history',
      icon: 'history',
      title: t('home.history.title'),
      description: t('home.history.description'),
      testID: 'home-history',
    },
    {
      href: '/settings',
      icon: 'cog-outline',
      title: t('home.settings.title'),
      description: t('home.settings.description'),
      testID: 'home-settings',
    },
  ];

  return (
    <Screen testID="home-screen">
      <AppText variant="body" color="textSecondary">
        {t('home.intro')}
      </AppText>
      {destinations.map((d) => (
        <NavCard
          key={d.testID}
          testID={d.testID}
          icon={d.icon}
          title={d.title}
          description={d.description}
          accessibilityLabel={d.a11yLabel}
          onPress={() => router.push(d.href)}
        />
      ))}
      <Notice tone="info" message={t('home.disclaimer')} />
    </Screen>
  );
}
