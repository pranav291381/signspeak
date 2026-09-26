import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface Props {
  title: string;
  description: string;
  icon: IconName;
  onPress: () => void;
  /** Spoken name when the visible title contains symbols (e.g. "→"). */
  accessibilityLabel?: string;
  testID?: string;
}

/** Large, full-width navigation card: icon + title + one-line description. */
export function NavCard({ title, description, icon, onPress, accessibilityLabel, testID }: Props) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel ?? title}. ${description}`}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          borderColor: colors.border,
          borderRadius: radii.lg,
          padding: spacing.lg,
          gap: spacing.lg,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.infoBackground, borderRadius: radii.md }]}>
        <Icon name={icon} size={30} color={colors.primary} />
      </View>
      <View style={styles.text}>
        <AppText variant="heading" accessibilityRole="none">
          {title}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {description}
        </AppText>
      </View>
      <Icon name="chevron-right" size={28} color={colors.textSecondary} />
    </Pressable>
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
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
