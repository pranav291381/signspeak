import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

/** `secondary` is a tonal button: tinted background, dark label. */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  /** `sm` for inline actions; still at least 48dp tall to touch. */
  size?: 'md' | 'sm';
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  size = 'md',
  disabled = false,
  busy = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: Props) {
  const { colors, radii, spacing } = useTheme();
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.primaryContainer, fg: colors.onPrimaryContainer, border: colors.primaryContainer },
    outline: { bg: 'transparent', fg: colors.primary, border: colors.outline },
    danger: { bg: colors.danger, fg: colors.onDanger, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  }[variant];
  const inactive = disabled || busy;
  const small = size === 'sm';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      pressedScale={0.96}
      pressedOpacity={0.9}
      style={[
        styles.base,
        {
          minHeight: small ? MIN_TOUCH_TARGET : 54,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderRadius: radii.pill,
          paddingHorizontal: small ? spacing.lg : spacing.xl,
          opacity: inactive ? 0.4 : 1,
        },
      ]}
    >
      <View style={styles.content}>
        {busy ? (
          <ActivityIndicator color={palette.fg} />
        ) : icon ? (
          <Icon name={icon} color={palette.fg} size={small ? 18 : 20} />
        ) : null}
        <AppText variant="label" style={{ color: palette.fg, flexShrink: 1, textAlign: 'center', fontSize: small ? 15 : 16 }}>
          {label}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
