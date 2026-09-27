import { useTranslation } from 'react-i18next';

import { InProgressScreen } from '@/features/in-progress/InProgressScreen';

// Learn (features/learn: alphabet map and tips) is parked while Sign → Text is finished.
export default function LearnTab() {
  const { t } = useTranslation();
  return <InProgressScreen title={t('learn.title')} testID="learn-in-progress" />;
}
