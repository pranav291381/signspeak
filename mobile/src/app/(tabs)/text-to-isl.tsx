import { useTranslation } from 'react-i18next';

import { InProgressScreen } from '@/features/in-progress/InProgressScreen';

// Text → ISL (features/text-to-isl) is parked while Sign → Text is finished.
export default function TextToIslTab() {
  const { t } = useTranslation();
  return <InProgressScreen title={t('screens.textToIsl')} testID="text-to-isl-in-progress" />;
}
