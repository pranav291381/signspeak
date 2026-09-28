import { useState, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useReduceMotion } from '@/accessibility/useReduceMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const NATIVE = Platform.OS !== 'web';

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: PressableStateCallbackType) => ReactNode);
  /** Size while held down (1 = no shrink). */
  pressedScale?: number;
  /** Opacity while held down. */
  pressedOpacity?: number;
}

/**
 * Pressable that eases down while held and springs back when released, on the
 * native thread. Every tappable part of the app uses it, so presses feel the
 * same everywhere. With the system's "reduce motion" setting it only dims.
 */
export function PressableScale({
  style,
  children,
  pressedScale = 0.97,
  pressedOpacity = 0.9,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReduceMotion();
  const progress = useState(() => new Animated.Value(0))[0];
  const [pressed, setPressed] = useState(false);

  const animate = (down: boolean) => {
    progress.stopAnimation();
    const animation = down
      ? Animated.timing(progress, { toValue: 1, duration: 90, useNativeDriver: NATIVE })
      : Animated.spring(progress, { toValue: 0, speed: 18, bounciness: reduceMotion ? 0 : 7, useNativeDriver: NATIVE });
    animation.start();
  };

  const state: PressableStateCallbackType = { pressed };
  const resolved = typeof style === 'function' ? style(state) : style;
  // Keep the component's own opacity (e.g. a dimmed disabled button) and dim from there.
  const base = StyleSheet.flatten(resolved)?.opacity;
  const opacity = typeof base === 'number' ? base : 1;
  const animated = {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [opacity, opacity * pressedOpacity] }),
    transform: [{ scale: reduceMotion ? 1 : progress.interpolate({ inputRange: [0, 1], outputRange: [1, pressedScale] }) }],
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(event: GestureResponderEvent) => {
        setPressed(true);
        animate(true);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        setPressed(false);
        animate(false);
        onPressOut?.(event);
      }}
      style={[resolved, animated]}
    >
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  );
}
