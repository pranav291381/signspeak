import { StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

interface Props {
  label: string;
  /** Current value or short detail, shown on the right. */
  value?: string;
  description?: string;
  icon?: IconName;
  onPress: () => void;
  tone?: 'default' | 'danger';
  testID?: string;
}

/** Tappable row that opens another screen or runs an action. */
export function ListRow({ label, value, description, icon, onPress, tone = 'default', testID }: Props) {
  const { colors, radii, spacing } = useTheme();
  const fg = tone === 'danger' ? colors.danger : colors.text;
  return (
    <PressableScale
      pressedScale={0.985}
      pressedOpacity={0.95}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[label, value, description].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { gap: spacing.md, borderRadius: radii.sm, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
      ]}
    >
      {icon ? (
        <View style={[styles.icon, { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm }]}>
          <Icon name={icon} size={20} color={tone === 'danger' ? colors.danger : colors.primary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong" style={{ color: fg }}>
          {label}
        </AppText>
        {description ? (
          <AppText variant="caption" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      <Icon name="chevron-right" size={22} color={colors.textSecondary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + 4,
  },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  value: { maxWidth: '40%' },
});
