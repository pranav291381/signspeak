import { useCameraPermissions } from 'expo-camera';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { StateView } from '@/components';

/** Renders `children` only once camera permission is granted; explains every other case. */
export function CameraGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return <StateView testID="camera-permission-checking" loading title={t('signToText.permission.checking')} />;
  }

  if (!permission.granted) {
    if (permission.canAskAgain) {
      return (
        <StateView
          testID="camera-permission-request"
          icon="camera-outline"
          title={t('signToText.permission.title')}
          message={t('signToText.permission.message')}
          action={{ label: t('signToText.permission.allow'), icon: 'camera', onPress: () => void requestPermission() }}
        />
      );
    }
    return (
      <StateView
        testID="camera-permission-denied"
        icon="camera-off-outline"
        tone="warning"
        title={t('signToText.permission.deniedTitle')}
        message={t('signToText.permission.deniedMessage')}
        action={{ label: t('common.openSettings'), icon: 'cog-outline', onPress: () => void Linking.openSettings() }}
      />
    );
  }

  return <>{children}</>;
}
