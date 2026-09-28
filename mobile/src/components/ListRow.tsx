import { StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme, type TileColor } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { IconTile } from './IconTile';
import { PressableScale } from './PressableScale';

interface Props {
  label: string;
  /** Current value or short detail, shown on the right. */
  value?: string;
  description?: string;
  icon?: IconName;
  /** Colour of the icon's tile (Settings-style rows). */
  tile?: TileColor;
  onPress: () => void;
  tone?: 'default' | 'danger';
  testID?: string;
}

/** Tappable row that opens another screen or runs an action. */
export function ListRow({ label, value, description, icon, tile, onPress, tone = 'default', testID }: Props) {
  const { colors, radii, spacing } = useTheme();
  const fg = tone === 'danger' ? colors.danger : colors.text;
  return (
    <PressableScale
      pressedScale={0.985}
      pressedOpacity={0.9}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[label, value, description].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          borderRadius: radii.md,
          marginHorizontal: -spacing.sm,
          paddingHorizontal: spacing.sm,
          backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
        },
      ]}
    >
      {icon ? <IconTile icon={icon} tile={tile} color={tone === 'danger' ? colors.danger : undefined} /> : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong" style={{ color: fg }}>
          {label}
        </AppText>
        {/* With a description the value goes under the label, so long text keeps the full width. */}
        {value && description ? (
          <AppText variant="label" color="textSecondary" numberOfLines={1}>
            {value}
          </AppText>
        ) : null}
        {description ? (
          <AppText variant="caption" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      {value && !description ? (
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
    minHeight: MIN_TOUCH_TARGET + 8,
    paddingVertical: 6,
  },
  text: { flex: 1, gap: 2 },
  value: { maxWidth: '40%' },
});
