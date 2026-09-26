import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Button, Notice, Screen, Section, StateView } from '@/components';
import { DemonstrationView } from '@/content/DemonstrationView';
import { getSign, hasVerifiedDemonstration, signsInCategory } from '@/content/library';
import { displayMeaning } from '@/content/matcher';
import { LANGUAGES } from '@/i18n/languages';
import { useProgress } from '@/learn/ProgressProvider';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

export function LessonScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useSettings();
  const { progress, setLearned } = useProgress();
  const sign = typeof id === 'string' ? getSign(id) : undefined;

  if (!sign) {
    return (
      <Screen>
        <StateView
          icon="book-off-outline"
          title={t('learn.notFound')}
          action={{ label: t('learn.backToLessons'), onPress: () => router.dismissTo('/learn') }}
        />
      </Screen>
    );
  }

  const { appLanguage, outputLanguage } = settings;
  const siblings = signsInCategory(sign.category);
  const next = siblings[siblings.findIndex((s) => s.id === sign.id) + 1];
  const learned = progress[sign.id]?.learnedAt != null;
  const canLearn = hasVerifiedDemonstration(sign);

  return (
    <Screen testID={`lesson-screen-${sign.id}`}>
      <AppText variant="display">{displayMeaning(sign, appLanguage)}</AppText>
      <AppText variant="caption" color="textSecondary">
        {t(`learn.categories.${sign.category}`)}
      </AppText>

      <DemonstrationView sign={sign} />

      <Section title={t('learn.lesson.meaning')}>
        <AppText variant="body">{displayMeaning(sign, appLanguage)}</AppText>
        {outputLanguage !== appLanguage && sign.meaning[outputLanguage] ? (
          <AppText variant="body" color="textSecondary">
            {t('learn.lesson.inLanguage', {
              language: LANGUAGES[outputLanguage].nativeName,
              meaning: sign.meaning[outputLanguage],
            })}
          </AppText>
        ) : null}
        {sign.gloss ? (
          <AppText variant="caption" color="textSecondary">
            {t('content.gloss', { gloss: sign.gloss })}
          </AppText>
        ) : (
          <AppText variant="caption" color="textSecondary">
            {t('learn.lesson.phraseNoGloss')}
          </AppText>
        )}
      </Section>

      {sign.verification.status !== 'verified' ? (
        <Notice tone="warning" icon="account-alert-outline" message={t('learn.lesson.unverified')} />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Button
          testID="mark-learned"
          variant={learned ? 'secondary' : 'primary'}
          icon={learned ? 'check-circle' : 'check-circle-outline'}
          label={learned ? t('learn.lesson.learned') : t('learn.lesson.markLearned')}
          disabled={!canLearn && !learned}
          onPress={() => setLearned(sign.id, !learned)}
        />
        {!canLearn ? (
          <AppText variant="caption" color="textSecondary">
            {t('learn.lesson.markLearnedDisabled')}
          </AppText>
        ) : null}
        <Button testID="practice" variant="secondary" icon="camera-outline" label={t('learn.lesson.practice')} disabled onPress={() => undefined} />
        <AppText variant="caption" color="textSecondary">
          {t('learn.lesson.practiceUnavailable')}
        </AppText>
        {next ? (
          <Button
            testID="next-lesson"
            variant="secondary"
            icon="arrow-right"
            label={t('learn.lesson.next', { name: displayMeaning(next, appLanguage) })}
            onPress={() => router.replace({ pathname: '/learn/sign/[id]', params: { id: next.id } })}
          />
        ) : null}
      </View>
    </Screen>
  );
}
