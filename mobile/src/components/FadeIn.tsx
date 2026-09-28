import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';

import { useReduceMotion } from '@/accessibility/useReduceMotion';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Wait before starting, e.g. to stagger a list. */
  delay?: number;
  /** How far it rises while fading in (dp). */
  distance?: number;
  duration?: number;
  /** A change of this value plays the entrance again (e.g. a new result). */
  trigger?: unknown;
  /** Starts slightly smaller and grows in, for results that should catch the eye. */
  pop?: boolean;
  testID?: string;
}

/**
 * Fades its content in while it rises into place, on the native thread.
 * Nothing moves with the system's "reduce motion" setting.
 */
export function FadeIn({ children, style, delay = 0, distance = 8, duration = 240, trigger, pop = false, testID }: Props) {
  const reduceMotion = useReduceMotion();
  const progress = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [trigger, reduceMotion, delay, duration, progress]);

  const transform = [
    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
    ...(pop ? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] : []),
  ];
  return (
    <Animated.View testID={testID} style={[style, { opacity: progress, transform }]}>
      {children}
    </Animated.View>
  );
}
