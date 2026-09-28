import { memo } from 'react';
import { Circle, Ellipse, G, Path, Polyline } from 'react-native-svg';

import { skeletonColors, useTheme } from '@/theme';

import { FINGERTIPS, type DiagramFocus, type Point, type SkeletonFrame, type ViewBox } from './skeleton';

/** Joints of each finger from the palm out (thumb … little), and the palm's outline. */
const FINGER_CHAINS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
const PALM = [0, 1, 5, 9, 13, 17] as const;
const PALM_OUTLINE = [0, 5, 9, 13, 17, 0] as const;
const KNUCKLES = [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19] as const;

const pointsOf = (points: readonly Point[], chain: readonly number[]) => chain.map((k) => `${points[k]![0]},${points[k]![1]}`).join(' ');

/** Circles of radius `r` at the given points, as one SVG path. */
function dots(points: readonly Point[], indices: readonly number[], r: number): string {
  return indices
    .map((k) => {
      const [x, y] = points[k]!;
      return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
    })
    .join('');
}

interface Props {
  frame: SkeletonFrame;
  viewBox: ViewBox;
  focus?: DiagramFocus;
  /** Drawn left-right reversed (as in a mirror). */
  mirror?: boolean;
  /** Overall opacity, e.g. for the faded start pose of a still diagram. */
  opacity?: number;
}

/**
 * One frame of a recorded sign: head, torso and arms for context, and the
 * hands with coloured fingers (thumb orange … little finger pink, the same on
 * both hands), their joints and fingertips.
 */
export const SkeletonFigure = memo(function SkeletonFigure({ frame, viewBox, focus = 'body', mirror = false, opacity = 1 }: Props) {
  const { scheme } = useTheme();
  const palette = skeletonColors[scheme];
  const unit = Math.max(viewBox.width, viewBox.height);
  const closeUp = focus === 'hands';
  const limb = unit * (closeUp ? 0.012 : 0.017);
  const body = frame.body;
  const centreX = viewBox.x + viewBox.width / 2;

  return (
    <G opacity={opacity} transform={mirror ? `matrix(-1 0 0 1 ${2 * centreX} 0)` : undefined}>
      {body && !closeUp ? (
        <G>
          <Path
            d={`M${body.leftShoulder[0]},${body.leftShoulder[1]} L${body.rightShoulder[0]},${body.rightShoulder[1]} L${body.rightHip[0]},${body.rightHip[1]} L${body.leftHip[0]},${body.leftHip[1]} Z`}
            fill={palette.body}
            fillOpacity={0.16}
            stroke={palette.body}
            strokeOpacity={0.45}
            strokeWidth={limb * 0.6}
            strokeLinejoin="round"
          />
          <Polyline
            points={`${(body.leftShoulder[0] + body.rightShoulder[0]) / 2},${(body.leftShoulder[1] + body.rightShoulder[1]) / 2} ${body.nose[0]},${body.nose[1] + 0.18}`}
            stroke={palette.body}
            strokeWidth={limb}
            strokeLinecap="round"
            opacity={0.6}
          />
          <Ellipse
            cx={body.nose[0]}
            cy={body.nose[1] - 0.08}
            rx={0.22}
            ry={0.28}
            fill={palette.body}
            fillOpacity={0.16}
            stroke={palette.body}
            strokeOpacity={0.7}
            strokeWidth={limb * 0.8}
          />
        </G>
      ) : null}
      {body ? (
        <G opacity={0.6}>
          {(
            [
              [body.leftShoulder, body.leftElbow, frame.left?.[0] ?? body.leftWrist],
              [body.rightShoulder, body.rightElbow, frame.right?.[0] ?? body.rightWrist],
            ] as const
          ).map(([shoulder, elbow, wrist], k) => (
            <Polyline
              key={k}
              points={closeUp ? `${elbow[0]},${elbow[1]} ${wrist[0]},${wrist[1]}` : `${shoulder[0]},${shoulder[1]} ${elbow[0]},${elbow[1]} ${wrist[0]},${wrist[1]}`}
              fill="none"
              stroke={palette.body}
              strokeWidth={limb}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </G>
      ) : null}
      {frame.left ? <Hand points={frame.left} unit={unit} opacity={frame.leftAlpha ?? 1} palette={palette} /> : null}
      {frame.right ? <Hand points={frame.right} unit={unit} opacity={frame.rightAlpha ?? 1} palette={palette} /> : null}
    </G>
  );
});

function Hand({
  points,
  unit,
  opacity,
  palette,
}: {
  points: readonly Point[];
  unit: number;
  opacity: number;
  palette: { fingers: readonly string[]; palm: string };
}) {
  if (opacity <= 0.01) return null;
  // Scale strokes to the hand, so close-ups and full-body views both look right.
  const size = Math.hypot(points[9]![0] - points[0]![0], points[9]![1] - points[0]![1]) || unit * 0.1;
  const stroke = Math.max(size * 0.15, unit * 0.007);
  return (
    <G opacity={opacity}>
      <Path
        d={`M${PALM.map((k) => `${points[k]![0]},${points[k]![1]}`).join(' L')} Z`}
        fill={palette.palm}
        fillOpacity={0.22}
      />
      <Polyline
        points={pointsOf(points, PALM_OUTLINE)}
        fill="none"
        stroke={palette.palm}
        strokeWidth={stroke * 0.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {FINGER_CHAINS.map((chain, finger) => (
        <G key={finger}>
          <Polyline
            points={pointsOf(points, chain)}
            fill="none"
            stroke={palette.fingers[finger]}
            strokeWidth={stroke * 2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.18}
          />
          <Polyline
            points={pointsOf(points, chain)}
            fill="none"
            stroke={palette.fingers[finger]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      ))}
      {/* All the joints in one shape: far fewer elements to update on every frame. */}
      <Path d={dots(points, KNUCKLES, stroke * 0.5)} fill={palette.palm} />
      {FINGERTIPS.map((k, finger) => (
        <Circle key={k} cx={points[k]![0]} cy={points[k]![1]} r={stroke * 0.9} fill={palette.fingers[finger]} />
      ))}
    </G>
  );
}
