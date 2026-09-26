import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, NavCard, Notice, Screen } from '@/components';
import { getLibrary, signsInCategory } from '@/content/library';
import { SIGN_CATEGORIES } from '@/content/types';
import { learnedCount } from '@/learn/progress';
import { useProgress } from '@/learn/ProgressProvider';

import { CATEGORY_ICONS } from './categories';

export function LearnHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { progress } = useProgress();
  const allIds = getLibrary().signs.map((s) => s.id);

  return (
    <Screen testID="learn-home">
      <Notice tone="warning" icon="account-check-outline" message={t('learn.contentNotice')} />
      <AppText variant="body" color="textSecondary">
        {t('learn.progressSummary', { learned: learnedCount(progress, allIds), total: allIds.length })}
      </AppText>
      {SIGN_CATEGORIES.map((category) => {
        const ids = signsInCategory(category).map((s) => s.id);
        return (
          <NavCard
            key={category}
            testID={`category-${category}`}
            icon={CATEGORY_ICONS[category]}
            title={t(`learn.categories.${category}`)}
            description={t('learn.categoryCount', { count: ids.length, learned: learnedCount(progress, ids) })}
            onPress={() => router.push({ pathname: '/learn/[category]', params: { category } })}
          />
        );
      })}
    </Screen>
  );
}
