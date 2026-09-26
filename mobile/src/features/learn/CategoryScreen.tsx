import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, Button, NavCard, Notice, Screen, StateView } from '@/components';
import { hasVerifiedDemonstration, signsInCategory } from '@/content/library';
import { displayMeaning } from '@/content/matcher';
import { useProgress } from '@/learn/ProgressProvider';
import { buildQuiz } from '@/learn/quiz';
import { useSettings } from '@/settings/SettingsProvider';

import { CATEGORY_ICONS, isCategory } from './categories';

export function CategoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const { settings } = useSettings();
  const { progress } = useProgress();

  if (!isCategory(category)) {
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

  const signs = signsInCategory(category);
  const quiz = buildQuiz(signs);

  return (
    <Screen testID={`category-screen-${category}`}>
      <AppText variant="title">{t(`learn.categories.${category}`)}</AppText>
      {signs.map((sign) => {
        const learned = progress[sign.id]?.learnedAt != null;
        const status = learned
          ? t('learn.status.learned')
          : hasVerifiedDemonstration(sign)
            ? t('learn.status.ready')
            : t('learn.status.comingSoon');
        return (
          <NavCard
            key={sign.id}
            testID={`lesson-${sign.id}`}
            icon={learned ? 'check-circle-outline' : CATEGORY_ICONS[category]}
            title={displayMeaning(sign, settings.appLanguage)}
            description={status}
            onPress={() => router.push({ pathname: '/learn/sign/[id]', params: { id: sign.id } })}
          />
        );
      })}
      {quiz.status === 'ready' ? (
        <Button
          icon="clipboard-check-outline"
          label={t('learn.quiz.start')}
          onPress={() => router.push({ pathname: '/learn/quiz/[category]', params: { category } })}
        />
      ) : (
        <Notice tone="info" icon="clipboard-clock-outline" message={t('learn.quiz.unavailable')} testID="quiz-unavailable" />
      )}
    </Screen>
  );
}
