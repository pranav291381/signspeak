import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

import { useReduceMotion } from '@/accessibility/useReduceMotion';
import { skeletonColors, useTheme } from '@/theme';

import {
  diagramViewBox,
  FINGERTIPS,
  HAND_BONES,
  keyFrameIndex,
  skeletonFrame,
  type DiagramFocus,
  type Point,
  type SkeletonFrame,
} from './skeleton';

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
 * glowing fingertips, with the head, shoulders and arms for context.
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
  const [index, setIndex] = useState(0);
  const cycleHandler = useRef(onCycle);
  useEffect(() => {
    cycleHandler.current = onCycle;
  });

  useEffect(() => {
    if (!animate) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (i >= skeletons.length) {
        i = 0;
        cycleHandler.current?.();
      }
      setIndex(i);
    }, 1000 / (DIAGRAM_FPS * speed));
    return () => clearInterval(timer);
  }, [animate, skeletons, speed]);

  const shown = skeletons[animate ? Math.min(index, skeletons.length - 1) : keyFrame];

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, { aspectRatio: aspect }, style]}
    >
      <Svg width="100%" height="100%" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}>
        {shown ? <SkeletonShape frame={shown} unit={Math.max(viewBox.width, viewBox.height)} focus={focus} /> : null}
      </Svg>
    </View>
  );
}

const SkeletonShape = memo(function SkeletonShape({
  frame,
  unit,
  focus,
}: {
  frame: SkeletonFrame;
  unit: number;
  focus: DiagramFocus;
}) {
  const { scheme } = useTheme();
  const palette = skeletonColors[scheme];
  const body = frame.body;
  const bodyWidth = unit * (focus === 'hands' ? 0.012 : 0.02);
  const arm = (a: Point, b: Point, key: string) => (
    <Line
      key={key}
      x1={a[0]}
      y1={a[1]}
      x2={b[0]}
      y2={b[1]}
      stroke={palette.body}
      strokeWidth={bodyWidth}
      strokeLinecap="round"
      opacity={0.7}
    />
  );

  return (
    <G>
      {body ? (
        <G>
          <Circle
            cx={body.nose[0]}
            cy={body.nose[1]}
            r={0.3}
            fill="none"
            stroke={palette.body}
            strokeWidth={bodyWidth}
            opacity={0.7}
          />
          {arm(body.leftShoulder, body.rightShoulder, 'shoulders')}
          {arm(body.leftShoulder, body.leftElbow, 'l-upper')}
          {arm(body.rightShoulder, body.rightElbow, 'r-upper')}
          {arm(body.leftElbow, frame.left?.[0] ?? body.leftWrist, 'l-fore')}
          {arm(body.rightElbow, frame.right?.[0] ?? body.rightWrist, 'r-fore')}
        </G>
      ) : null}
      {frame.left ? <Hand points={frame.left} unit={unit} fingers={palette.fingers} palm={palette.palm} /> : null}
      {frame.right ? <Hand points={frame.right} unit={unit} fingers={palette.fingers} palm={palette.palm} /> : null}
    </G>
  );
});

function Hand({
  points,
  unit,
  fingers,
  palm,
}: {
  points: Point[];
  unit: number;
  fingers: readonly string[];
  palm: string;
}) {
  // Scale strokes to the hand, so close-ups and full-body views both look right.
  const size = Math.hypot(points[9]![0] - points[0]![0], points[9]![1] - points[0]![1]) || unit * 0.1;
  const stroke = Math.max(size * 0.09, unit * 0.006);
  const color = (finger: number) => (finger === 5 ? palm : fingers[finger]!);
  return (
    <G>
      {HAND_BONES.map(([a, b, finger]) => (
        <Line
          key={`glow-${a}-${b}`}
          x1={points[a]![0]}
          y1={points[a]![1]}
          x2={points[b]![0]}
          y2={points[b]![1]}
          stroke={color(finger)}
          strokeWidth={stroke * 2.6}
          strokeLinecap="round"
          opacity={0.18}
        />
      ))}
      {HAND_BONES.map(([a, b, finger]) => (
        <Line
          key={`bone-${a}-${b}`}
          x1={points[a]![0]}
          y1={points[a]![1]}
          x2={points[b]![0]}
          y2={points[b]![1]}
          stroke={color(finger)}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      ))}
      {points.map(([x, y], k) =>
        (FINGERTIPS as readonly number[]).includes(k) ? null : (
          <Circle key={`joint-${k}`} cx={x} cy={y} r={stroke * 0.55} fill={palm} />
        ),
      )}
      {FINGERTIPS.map((k, finger) => (
        <G key={`tip-${k}`}>
          <Circle cx={points[k]![0]} cy={points[k]![1]} r={stroke * 1.6} fill={fingers[finger]} opacity={0.3} />
          <Circle cx={points[k]![0]} cy={points[k]![1]} r={stroke * 0.85} fill={fingers[finger]} />
        </G>
      ))}
    </G>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
});
