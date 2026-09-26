import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Screen, StateView } from '@/components';
import { signsInCategory } from '@/content/library';
import { useProgress } from '@/learn/ProgressProvider';
import { buildQuiz } from '@/learn/quiz';
import { useSettings } from '@/settings/SettingsProvider';

import { isCategory } from './categories';
import { QuizRunner } from './QuizRunner';

export function QuizScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const { settings } = useSettings();
  const { recordQuizAnswer } = useProgress();
  const [attempt, setAttempt] = useState(0);

  const signs = isCategory(category) ? signsInCategory(category) : [];
  const quiz = buildQuiz(signs);

  if (quiz.status !== 'ready') {
    return (
      <Screen testID="quiz-screen">
        <StateView
          testID="quiz-unavailable"
          icon="clipboard-clock-outline"
          title={t('learn.quiz.unavailableTitle')}
          message={t('learn.quiz.unavailable')}
          action={{ label: t('learn.backToLessons'), onPress: () => router.dismissTo('/learn') }}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="quiz-screen">
      <QuizRunner
        key={attempt}
        questions={quiz.questions}
        signs={new Map(signs.map((s) => [s.id, s]))}
        language={settings.appLanguage}
        onAnswer={recordQuizAnswer}
        onRestart={() => setAttempt((n) => n + 1)}
      />
    </Screen>
  );
}
