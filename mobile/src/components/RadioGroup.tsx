import { StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  accessibilityLabel?: string;
}

interface Props<T extends string> {
  label: string;
  hint?: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

/** Single-choice list. Selection is shown with a check icon and outline, not colour alone. */
export function RadioGroup<T extends string>({ label, hint, options, value, onChange, testID }: Props<T>) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: spacing.sm }}>
      <View style={{ gap: 2 }}>
        <AppText variant="bodyStrong">{label}</AppText>
        {hint ? (
          <AppText variant="caption" color="textSecondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            pressedScale={0.98}
            pressedOpacity={0.95}
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: selected ? colors.primary : colors.border,
                borderWidth: selected ? 2 : 1,
                borderRadius: radii.md,
                paddingHorizontal: spacing.md,
                gap: spacing.md,
                backgroundColor: selected ? colors.primaryContainer : pressed ? colors.surfaceAlt : colors.surface,
              },
            ]}
          >
            <View style={styles.text}>
              <AppText variant={selected ? 'bodyStrong' : 'body'}>{option.label}</AppText>
              {option.description ? (
                <AppText variant="caption" color="textSecondary">
                  {option.description}
                </AppText>
              ) : null}
            </View>
            <Icon
              name={selected ? 'check-circle' : 'circle-outline'}
              color={selected ? colors.primary : colors.outline}
              size={22}
            />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingVertical: 8,
  },
  text: { flex: 1 },
});
