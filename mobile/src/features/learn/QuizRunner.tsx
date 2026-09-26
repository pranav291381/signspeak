import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Button, Notice, RadioGroup, StateView } from '@/components';
import { DemonstrationView } from '@/content/DemonstrationView';
import { displayMeaning } from '@/content/matcher';
import type { SignEntry } from '@/content/types';
import type { LanguageCode } from '@/i18n/languages';
import { scoreQuiz, type QuizQuestion } from '@/learn/quiz';
import { useTheme } from '@/theme';

interface Props {
  questions: QuizQuestion[];
  signs: Map<string, SignEntry>;
  language: LanguageCode;
  onAnswer: (signId: string, correct: boolean) => void;
  onRestart: () => void;
}

export function QuizRunner({ questions, signs, language, onAnswer, onRestart }: Props) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const checked = answers.length > index;

  if (index >= questions.length) {
    return (
      <StateView
        testID="quiz-result"
        icon="trophy-outline"
        title={t('learn.quiz.result', { correct: scoreQuiz(questions, answers), total: questions.length })}
        action={{ label: t('learn.quiz.again'), icon: 'refresh', onPress: onRestart }}
      />
    );
  }

  const question = questions[index]!;
  const target = signs.get(question.signId)!;
  const options = question.optionIds.map((id) => ({ value: id, label: displayMeaning(signs.get(id)!, language) }));
  const answeredIndex = answers[index];
  const correct = answeredIndex === question.answerIndex;

  const check = () => {
    if (choice === null) return;
    const picked = question.optionIds.indexOf(choice);
    setAnswers((a) => [...a, picked]);
    onAnswer(question.signId, picked === question.answerIndex);
  };

  const next = () => {
    setChoice(null);
    setIndex((i) => i + 1);
  };

  return (
    <View style={{ gap: spacing.lg }} testID="quiz-question">
      <AppText variant="caption" color="textSecondary">
        {t('learn.quiz.progress', { current: index + 1, total: questions.length })}
      </AppText>
      <DemonstrationView sign={target} />
      <RadioGroup
        testID="quiz-options"
        label={t('learn.quiz.question')}
        options={options}
        value={choice ?? ''}
        onChange={(value) => !checked && setChoice(value)}
      />
      {checked ? (
        <>
          <Notice
            testID="quiz-feedback"
            tone={correct ? 'success' : 'danger'}
            message={correct ? t('learn.quiz.correct') : t('learn.quiz.incorrect', { answer: displayMeaning(target, language) })}
          />
          <Button
            icon="arrow-right"
            label={index + 1 < questions.length ? t('learn.quiz.next') : t('learn.quiz.finish')}
            onPress={next}
          />
        </>
      ) : (
        <Button testID="quiz-check" icon="check" label={t('learn.quiz.check')} disabled={choice === null} onPress={check} />
      )}
    </View>
  );
}
