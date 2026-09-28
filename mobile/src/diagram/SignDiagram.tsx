import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg from 'react-native-svg';

import { useReduceMotion } from '@/accessibility/useReduceMotion';

import { diagramViewBox, keyFrameIndex, lerpSkeleton, skeletonFrame, type DiagramFocus } from './skeleton';
import { SkeletonFigure } from './SkeletonFigure';
import { useAnimationFrames } from './useAnimationFrames';

export const DIAGRAM_FPS = 15;

interface Props {
  /** Landmark frames (feature spec v1) recorded at DIAGRAM_FPS. */
  frames: readonly ArrayLike<number>[];
  focus?: DiagramFocus;
  /** Loop the movement. Ignored when the user asked for reduced motion. */
  playing?: boolean;
  /** Width / height. */
  aspect?: number;
  /** Playback speed multiplier. */
  speed?: number;
  /** Called after each full pass through the frames. */
  onCycle?: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A recorded sign drawn as a hand skeleton: coloured fingers, joints and
 * fingertips, with the head, shoulders and arms for context. Plays smoothly,
 * drawing in-between positions between the recorded frames.
 */
export function SignDiagram({
  frames,
  focus = 'body',
  playing = true,
  aspect = 1,
  speed = 1,
  onCycle,
  accessibilityLabel,
  style,
  testID,
}: Props) {
  const reduceMotion = useReduceMotion();
  const skeletons = useMemo(() => frames.map(skeletonFrame), [frames]);
  const viewBox = useMemo(() => diagramViewBox(skeletons, focus, aspect), [skeletons, focus, aspect]);
  const keyFrame = useMemo(() => keyFrameIndex(skeletons), [skeletons]);
  const animate = playing && !reduceMotion && skeletons.length > 1;
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);

  useAnimationFrames(animate, (elapsedMs) => {
    const last = skeletons.length - 1;
    let t = timeRef.current + (elapsedMs / 1000) * DIAGRAM_FPS * speed;
    if (t >= last) {
      t = 0;
      onCycle?.();
    }
    timeRef.current = t;
    setTime(t);
  });

  const index = Math.min(Math.floor(time), skeletons.length - 1);
  const shown = animate
    ? lerpSkeleton(skeletons[index]!, skeletons[Math.min(index + 1, skeletons.length - 1)]!, time - index)
    : skeletons[keyFrame];

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, { aspectRatio: aspect }, style]}
    >
      <Svg width="100%" height="100%" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}>
        {shown ? <SkeletonFigure frame={shown} viewBox={viewBox} focus={focus} /> : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
});
