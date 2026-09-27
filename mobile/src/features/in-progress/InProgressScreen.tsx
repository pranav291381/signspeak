import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen, StateView } from '@/components';

/** Placeholder for a section that is being rebuilt; points back to Sign → Text. */
export function InProgressScreen({ title, testID }: { title: string; testID?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen title={title} testID={testID}>
      <StateView
        testID="in-progress"
        icon="progress-wrench"
        title={t('inProgress.title')}
        message={t('inProgress.message')}
        action={{
          label: t('inProgress.goToSign'),
          icon: 'hand-wave-outline',
          onPress: () => router.navigate('/sign-to-text'),
        }}
      />
    </Screen>
  );
}
