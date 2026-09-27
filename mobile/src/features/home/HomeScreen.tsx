import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Button, Card, Icon, ListRow, NavCard, Notice, Screen } from '@/components';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { ALPHABET } from '@/personal/types';
import { useTheme } from '@/theme';

export function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const { signs, recognizable } = usePersonalSigns();
  const letters = signs.filter((s) => s.target.kind === 'letter').length;
  const words = signs.length - letters;

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
      <NavCard
        testID="home-learn"
        icon="school-outline"
        title={t('home.learn.title')}
        accessibilityLabel={t('home.learn.a11yLabel')}
        description={t('home.learn.description')}
        onPress={() => router.navigate('/learn')}
      />

      <Card testID="home-signs">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radii.md,
              backgroundColor: colors.primaryContainer,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="hand-back-right-outline" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{t('home.signs.title')}</AppText>
            <AppText variant="caption" color="textSecondary">
              {signs.length === 0
                ? t('home.signs.empty')
                : t('home.signs.summary', { words, letters, total: ALPHABET.length, ready: recognizable.length })}
            </AppText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              testID="home-teach"
              size="sm"
              icon="plus"
              label={t('home.signs.teach')}
              onPress={() => router.push('/signs/teach')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID="home-my-signs"
              size="sm"
              variant="secondary"
              label={t('home.signs.manage')}
              onPress={() => router.push('/signs')}
            />
          </View>
        </View>
      </Card>

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
