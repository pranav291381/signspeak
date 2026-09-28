import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/useReduceMotion';

interface Props {
  color: string;
  /** Pulses while true: something is live (watching, recording). */
  pulsing?: boolean;
  size?: number;
}

/** A status dot; while live, a ring breathes out of it. Decorative. */
export function LiveDot({ color, pulsing = false, size = 10 }: Props) {
  const reduceMotion = useReduceMotion();
  const progress = useState(() => new Animated.Value(0))[0];
  const animate = pulsing && !reduceMotion;

  useEffect(() => {
    if (!animate) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, progress]);

  return (
    <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
      {animate ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              backgroundColor: color,
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
            },
          ]}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: color }]} />
    </View>
  );
}
