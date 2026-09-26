import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

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

/** Single-choice list. Selection is shown with an icon and bold text, not colour alone. */
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
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              {
                borderColor: selected ? colors.primary : colors.border,
                borderWidth: selected ? 2 : 1,
                borderRadius: radii.md,
                paddingHorizontal: spacing.md,
                gap: spacing.md,
                backgroundColor: selected ? colors.infoBackground : colors.surface,
              },
            ]}
          >
            <Icon
              name={selected ? 'radiobox-marked' : 'radiobox-blank'}
              color={selected ? colors.primary : colors.textSecondary}
            />
            <View style={styles.text}>
              <AppText variant={selected ? 'bodyStrong' : 'body'}>{option.label}</AppText>
              {option.description ? (
                <AppText variant="caption" color="textSecondary">
                  {option.description}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 8,
  },
  text: { flex: 1 },
});
