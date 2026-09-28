import { StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

interface Props {
  title: string;
  description: string;
  icon: IconName;
  onPress: () => void;
  /** `primary` is the filled hero style for the main actions. */
  tone?: 'default' | 'primary';
  /** Spoken name when the visible title contains symbols (e.g. "→"). */
  accessibilityLabel?: string;
  testID?: string;
}

/** Full-width navigation card: icon + title + one-line description. */
export function NavCard({ title, description, icon, onPress, tone = 'default', accessibilityLabel, testID }: Props) {
  const { colors, elevation, radii, spacing } = useTheme();
  const hero = tone === 'primary';
  const fg = hero ? colors.onPrimary : colors.text;
  const fgSecondary = hero ? colors.onPrimary : colors.textSecondary;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel ?? title}. ${description}`}
      onPress={onPress}
      testID={testID}
      pressedScale={0.975}
      pressedOpacity={0.94}
      style={[
        styles.card,
        hero ? null : elevation.card,
        {
          backgroundColor: hero ? colors.primary : colors.surface,
          borderColor: hero ? colors.primary : colors.border,
          borderRadius: radii.lg,
          padding: spacing.lg,
          gap: spacing.lg,
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: hero ? 'rgba(255,255,255,0.18)' : colors.primaryContainer, borderRadius: radii.md },
        ]}
      >
        <Icon name={icon} size={26} color={hero ? colors.onPrimary : colors.primary} />
      </View>
      <View style={styles.text}>
        <AppText variant="heading" accessibilityRole="none" style={{ color: fg }}>
          {title}
        </AppText>
        <AppText variant="caption" style={{ color: fgSecondary, opacity: hero ? 0.9 : 1 }}>
          {description}
        </AppText>
      </View>
      <Icon name="chevron-right" size={24} color={fgSecondary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + 24,
    borderWidth: 1,
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
