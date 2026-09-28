import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card, ListRow, NavCard, Notice, Screen } from '@/components';
import { useTheme } from '@/theme';

export function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();

  return (
    <Screen testID="home-screen" title={t('home.title')} subtitle={t('home.intro')}>
      <NavCard
        testID="home-sign-to-text"
        tone="primary"
        icon="hand-wave"
        title={t('home.signToText.title')}
        accessibilityLabel={t('home.signToText.a11yLabel')}
        description={t('home.signToText.description')}
        onPress={() => router.navigate('/sign-to-text')}
      />
      <NavCard
        testID="home-text-to-isl"
        icon="message-text-outline"
        title={t('home.textToIsl.title')}
        accessibilityLabel={t('home.textToIsl.a11yLabel')}
        description={t('home.textToIsl.description')}
        onPress={() => router.navigate('/text-to-isl')}
      />
      <Card padded={false} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
        <ListRow
          testID="home-history"
          icon="history"
          label={t('home.history.title')}
          description={t('home.history.description')}
          onPress={() => router.push('/history')}
        />
      </Card>

      <Notice tone="info" message={t('home.disclaimer')} />
    </Screen>
  );
}
