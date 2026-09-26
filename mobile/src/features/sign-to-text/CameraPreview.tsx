import { CameraView } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { CameraFacing } from '@/settings/settings';
import { useTheme } from '@/theme';

interface Props {
  facing: CameraFacing;
  /** False pauses the preview (saves battery when paused or hidden). */
  active: boolean;
  onReady: () => void;
  onError: (message: string) => void;
}

/** Live preview with a framing guide. Frames are never recorded or saved. */
export function CameraPreview({ facing, active, onReady, onError }: Props) {
  const { t } = useTranslation();
  const { colors, radii } = useTheme();

  return (
    <View
      testID="camera-preview"
      accessible
      accessibilityLabel={t('signToText.a11y.cameraPreview', { framing: t('signToText.framing') })}
      style={[styles.container, { borderRadius: radii.lg, backgroundColor: colors.surfaceMuted }]}
    >
      <CameraView
        style={StyleSheet.absoluteFill}
        facing={facing}
        active={active}
        mute
        animateShutter={false}
        onCameraReady={onReady}
        onMountError={(event) => onError(event.message)}
      />
      {/* Framing guide: white with a dark outline so it is visible on any background. */}
      <View pointerEvents="none" style={[styles.guideOuter, { borderRadius: radii.lg }]}>
        <View style={[styles.guideInner, { borderRadius: radii.lg - 2 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 420,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  guideOuter: {
    position: 'absolute',
    top: '8%',
    bottom: '8%',
    left: '12%',
    right: '12%',
    borderWidth: 1,
    borderColor: '#000000',
  },
  guideInner: {
    flex: 1,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
});
