import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

interface Props {
  tone?: NoticeTone;
  title?: string;
  message: string;
  icon?: IconName;
  testID?: string;
}

const DEFAULT_ICONS: Record<NoticeTone, IconName> = {
  info: 'information-outline',
  success: 'check-circle-outline',
  warning: 'alert-outline',
  danger: 'alert-octagon-outline',
};

/**
 * Inline message. Tone is shown by icon + text + border, never by colour alone,
 * and changes are announced to screen readers.
 */
export function Notice({ tone = 'info', title, message, icon, testID }: Props) {
  const { colors, radii, spacing } = useTheme();
  const tones = {
    info: { fg: colors.info, bg: colors.infoBackground },
    success: { fg: colors.success, bg: colors.successBackground },
    warning: { fg: colors.warning, bg: colors.warningBackground },
    danger: { fg: colors.danger, bg: colors.dangerBackground },
  }[tone];

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      accessibilityLabel={title ? `${title}. ${message}` : message}
      style={[
        styles.container,
        {
          backgroundColor: tones.bg,
          borderColor: tones.fg,
          borderRadius: radii.md,
          padding: spacing.md,
          gap: spacing.md,
        },
      ]}
    >
      <Icon name={icon ?? DEFAULT_ICONS[tone]} color={tones.fg} size={24} />
      <View style={styles.text}>
        {title ? (
          <AppText variant="bodyStrong" accessibilityRole="none">
            {title}
          </AppText>
        ) : null}
        <AppText variant="body">{message}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
