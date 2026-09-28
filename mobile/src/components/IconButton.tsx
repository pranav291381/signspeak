import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

interface Props {
  icon: IconName;
  /** Required: the button has no visible text. */
  accessibilityLabel: string;
  onPress: () => void;
  /** `overlay` sits on top of the camera preview. */
  variant?: 'tonal' | 'filled' | 'plain' | 'overlay' | 'accent';
  size?: number;
  disabled?: boolean;
  selected?: boolean;
  testID?: string;
}

/** Round icon-only button, at least 48dp. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'tonal',
  size = MIN_TOUCH_TARGET,
  disabled = false,
  selected,
  testID,
}: Props) {
  const { colors } = useTheme();
  const palette = {
    tonal: { bg: colors.surfaceAlt, fg: colors.text },
    filled: { bg: colors.primary, fg: colors.onPrimary },
    plain: { bg: 'transparent', fg: colors.textSecondary },
    overlay: { bg: colors.scrim, fg: colors.onScrim },
    accent: { bg: colors.accent, fg: colors.onAccent },
  }[variant];
  const dimension = Math.max(size, MIN_TOUCH_TARGET);

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      pressedScale={0.88}
      pressedOpacity={0.8}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.bg,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={Math.round(dimension * 0.46)} color={palette.fg} />
    </PressableScale>
  );
}
