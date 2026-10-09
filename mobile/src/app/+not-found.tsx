import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen, StateView } from '@/components';

/** A link to a page that does not exist (or no longer does): say so, and offer the way home. */
export default function NotFound() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen testID="not-found-screen">
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <StateView
        icon="map-marker-question-outline"
        title={t('notFound.title')}
        message={t('notFound.message')}
        action={{ label: t('notFound.home'), icon: 'home-variant-outline', onPress: () => router.replace('/') }}
      />
    </Screen>
  );
}
