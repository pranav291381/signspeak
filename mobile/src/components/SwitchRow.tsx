import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';

interface Props {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}

/** A labelled switch. The whole row is one touch target and one screen-reader element. */
export function SwitchRow({ label, hint, value, onValueChange, testID }: Props) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      style={[styles.row, { gap: spacing.md }]}
    >
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
        trackColor={{ true: colors.primary, false: colors.border }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  text: { flex: 1, gap: 2 },
});
