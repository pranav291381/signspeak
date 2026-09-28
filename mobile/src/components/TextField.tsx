import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';

interface Props extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  /** Visible label; also the input's spoken name. */
  label: string;
  hint?: string;
  /** Shown under the field and announced; marks the field invalid. */
  error?: string;
  testID?: string;
}

/** Labelled text input with a clear focus state. */
export function TextField({ label, hint, error, multiline, testID, onFocus, onBlur, ...rest }: Props) {
  const { colors, radii, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.outline;

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      {hint ? (
        <AppText variant="caption" color="textSecondary">
          {hint}
        </AppText>
      ) : null}
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-invalid={error ? true : undefined}
        multiline={multiline}
        placeholderTextColor={colors.textSecondary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          typography.body,
          {
            minHeight: multiline ? 120 : MIN_TOUCH_TARGET + 8,
            textAlignVertical: multiline ? 'top' : 'center',
            borderWidth: focused || error ? 2 : 1.5,
            borderColor,
            borderRadius: radii.md + 2,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm + 2,
            color: colors.text,
            backgroundColor: colors.surface,
          },
        ]}
        {...rest}
      />
      {error ? (
        <AppText
          testID={testID ? `${testID}-error` : undefined}
          variant="caption"
          color="danger"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
