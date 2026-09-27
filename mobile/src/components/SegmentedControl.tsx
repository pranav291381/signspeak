import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

interface Props<T extends string> {
  /** Spoken name of the whole control. */
  label: string;
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

/** Compact single choice between two to four options. */
export function SegmentedControl<T extends string>({ label, segments, value, onChange, testID }: Props<T>) {
  const { colors, elevation, radii } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: colors.surfaceAlt, borderRadius: radii.md + 2 }]}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            testID={testID ? `${testID}-${segment.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(segment.value)}
            style={[
              styles.segment,
              selected ? elevation.card : null,
              {
                borderRadius: radii.md,
                backgroundColor: selected ? colors.surface : 'transparent',
                borderColor: selected ? colors.outline : 'transparent',
              },
            ]}
          >
            {segment.icon ? (
              <Icon name={segment.icon} size={18} color={selected ? colors.primary : colors.textSecondary} />
            ) : null}
            <AppText
              variant="label"
              numberOfLines={1}
              style={{ color: selected ? colors.text : colors.textSecondary, flexShrink: 1 }}
            >
              {segment.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
  },
});
