import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen, StateView } from '@/components';

/** Honest placeholder for features that have not been built yet. */
export function NotAvailableYetScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen testID="not-available-screen">
      <StateView
        icon="progress-wrench"
        title={t('common.notAvailableYet')}
        message={t('common.featureInProgress')}
        action={{ label: t('common.goHome'), icon: 'home-outline', onPress: () => router.dismissTo('/') }}
      />
    </Screen>
  );
}
