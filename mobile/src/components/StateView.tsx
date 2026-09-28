import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

interface Action {
  label: string;
  onPress: () => void;
  icon?: IconName;
}

interface Props {
  title: string;
  message?: string;
  icon?: IconName;
  /** Shows a spinner instead of the icon. */
  loading?: boolean;
  tone?: 'neutral' | 'warning' | 'danger';
  action?: Action;
  secondaryAction?: Action;
  /** Less padding, for use inside cards. */
  compact?: boolean;
  testID?: string;
}

/**
 * Full-area state (loading, empty, error, permission…) with a recovery action.
 * Used so that no feature can fail silently.
 */
export function StateView({
  title,
  message,
  icon = 'information-outline',
  loading = false,
  tone = 'neutral',
  action,
  secondaryAction,
  compact = false,
  testID,
}: Props) {
  const { colors, spacing } = useTheme();
  const toneColors = {
    neutral: { fg: colors.onAccent, bg: colors.accent },
    warning: { fg: colors.warning, bg: colors.warningBackground },
    danger: { fg: colors.danger, bg: colors.dangerBackground },
  }[tone];

  return (
    <View
      testID={testID}
      style={[styles.container, { padding: compact ? spacing.md : spacing.xl, gap: spacing.lg }]}
    >
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={message ? `${title}. ${message}` : title}
        style={[styles.text, { gap: spacing.sm }]}
      >
        <View style={[styles.badge, { backgroundColor: toneColors.bg, marginBottom: spacing.sm }]}>
          {loading ? (
            <ActivityIndicator size="large" color={toneColors.fg} />
          ) : (
            <Icon name={icon} size={38} color={toneColors.fg} />
          )}
        </View>
        <AppText variant="title" style={styles.center}>
          {title}
        </AppText>
        {message ? (
          <AppText variant="body" color="textSecondary" style={styles.center}>
            {message}
          </AppText>
        ) : null}
      </View>
      {action || secondaryAction ? (
        <View style={{ gap: spacing.sm, alignSelf: 'stretch' }}>
          {action ? <Button label={action.label} icon={action.icon} onPress={action.onPress} /> : null}
          {secondaryAction ? (
            <Button
              variant="secondary"
              label={secondaryAction.label}
              icon={secondaryAction.icon}
              onPress={secondaryAction.onPress}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  text: {
    alignItems: 'center',
  },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
