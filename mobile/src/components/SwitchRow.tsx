import { Platform, StyleSheet, Switch, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme, type TileColor } from '@/theme';

import { AppText } from './AppText';
import type { IconName } from './Icon';
import { IconTile } from './IconTile';
import { PressableScale } from './PressableScale';

interface Props {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon?: IconName;
  /** Colour of the icon's tile (Settings-style rows). */
  tile?: TileColor;
  testID?: string;
}

/** A labelled switch. The whole row is one touch target and one screen-reader element. */
export function SwitchRow({ label, hint, value, onValueChange, icon, tile, testID }: Props) {
  const { colors, spacing } = useTheme();
  return (
    <PressableScale
      pressedScale={0.985}
      pressedOpacity={0.95}
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      style={[styles.row, { gap: spacing.md }]}
    >
      {icon ? <IconTile icon={icon} tile={tile} /> : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong">{label}</AppText>
        {hint ? (
          <AppText variant="caption" color="textSecondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.outline }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.outline}
        // react-native-web colours the thumb of a switched-on switch separately (teal by default).
        {...(Platform.OS === 'web' ? ({ activeThumbColor: colors.surface } as object) : null)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
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
});
