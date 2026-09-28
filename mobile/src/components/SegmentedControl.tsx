import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useReduceMotion } from '@/accessibility/useReduceMotion';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

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

const PADDING = 4;
const GAP = 4;

/**
 * Compact single choice between two to four options. The selected option's
 * raised background slides to the new choice.
 */
export function SegmentedControl<T extends string>({ label, segments, value, onChange, testID }: Props<T>) {
  const { colors, elevation, radii } = useTheme();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, segments.findIndex((s) => s.value === value));
  const segmentWidth = width > 0 ? (width - 2 * PADDING - GAP * (segments.length - 1)) / segments.length : 0;
  const offset = useState(() => new Animated.Value(0))[0];
  const placed = useRef(false);

  useEffect(() => {
    if (segmentWidth <= 0) return;
    const target = index * (segmentWidth + GAP);
    if (!placed.current || reduceMotion) {
      offset.setValue(target);
      placed.current = true;
      return;
    }
    Animated.spring(offset, { toValue: target, speed: 16, bounciness: 5, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [index, segmentWidth, reduceMotion, offset]);

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: colors.surfaceAlt, borderRadius: radii.md + 2 }]}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            elevation.card,
            {
              width: segmentWidth,
              borderRadius: radii.md,
              backgroundColor: colors.surface,
              borderColor: colors.outline,
              transform: [{ translateX: offset }],
            },
          ]}
        />
      ) : null}
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <PressableScale
            key={segment.value}
            pressedScale={0.95}
            pressedOpacity={0.85}
            testID={testID ? `${testID}-${segment.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(segment.value)}
            style={[
              styles.segment,
              {
                borderRadius: radii.md,
                // Before the track is measured, show the selection without the sliding thumb.
                backgroundColor: selected && segmentWidth <= 0 ? colors.surface : 'transparent',
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
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PADDING,
    gap: GAP,
  },
  thumb: {
    position: 'absolute',
    top: PADDING,
    bottom: PADDING,
    left: PADDING,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
});
