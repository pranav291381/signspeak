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
  testID,
}: Props) {
  const { colors, spacing } = useTheme();
  const iconColor = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.primary;

  return (
    <View testID={testID} style={[styles.container, { padding: spacing.xl, gap: spacing.lg }]}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={message ? `${title}. ${message}` : title}
        style={[styles.text, { gap: spacing.sm }]}
      >
        {loading ? <ActivityIndicator size="large" color={colors.primary} /> : <Icon name={icon} size={48} color={iconColor} />}
        <AppText variant="heading" style={styles.center}>
          {title}
        </AppText>
        {message ? (
          <AppText variant="body" color="textSecondary" style={styles.center}>
            {message}
          </AppText>
        ) : null}
      </View>
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
  center: {
    textAlign: 'center',
  },
});
