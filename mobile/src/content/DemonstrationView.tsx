import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components';
import { useTheme } from '@/theme';

import { hasVerifiedDemonstration } from './library';
import type { SignEntry } from './types';

/**
 * Shows a sign's demonstration, or a clear placeholder when no verified
 * demonstration exists. It never shows unverified media.
 *
 * Extension point: when the first verified media pack exists, render it in the
 * verified branch (e.g. with expo-video, which is not installed yet because there
 * is no media to play). See src/content/README.md.
 */
export function DemonstrationView({ sign }: { sign: SignEntry }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const verified = hasVerifiedDemonstration(sign);

  return (
    <View
      testID={verified ? 'demonstration' : 'demonstration-placeholder'}
      accessible
      accessibilityLabel={
        verified ? t('content.demonstration.pendingPlayer') : `${t('content.demonstration.unavailableTitle')}. ${t('content.demonstration.unavailableMessage')}`
      }
      style={[
        styles.box,
        { borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt, padding: spacing.lg, gap: spacing.sm },
      ]}
    >
      <Icon name={verified ? 'play-circle-outline' : 'video-off-outline'} size={40} color={colors.textSecondary} />
      {verified ? (
        <AppText variant="body" style={styles.center}>
          {t('content.demonstration.pendingPlayer')}
        </AppText>
      ) : (
        <>
          <AppText variant="bodyStrong" style={styles.center}>
            {t('content.demonstration.unavailableTitle')}
          </AppText>
          <AppText variant="caption" color="textSecondary" style={styles.center}>
            {t('content.demonstration.unavailableMessage')}
          </AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', minHeight: 160 },
  center: { textAlign: 'center' },
});
