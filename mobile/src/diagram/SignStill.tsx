import { memo, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Path, Polyline } from 'react-native-svg';

import { useTheme } from '@/theme';

import { fitViewBox, signingViewBox, type ViewBox } from './skeleton';
import { stillOf, type Still } from './still';
import { SkeletonFigure } from './SkeletonFigure';
import type { MotionClip } from './timeline';

interface Props {
  clip: MotionClip;
  viewBox?: ViewBox;
  aspect?: number;
  mirror?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A recorded sign as one picture: where the hands start (faded), where they
 * end (solid) and the path each hand takes, with an arrow at its end.
 */
export const SignStill = memo(function SignStill({ clip, viewBox, aspect = 1, mirror = false, accessibilityLabel, style, testID }: Props) {
  const { colors } = useTheme();
  const still: Still | null = useMemo(() => stillOf(clip), [clip]);
  // Close in on the hands, keeping the head and shoulders for where they are.
  const box = useMemo(
    () => (viewBox ? fitViewBox(viewBox, aspect) : signingViewBox(still ? still.frames : clip.skeletons, aspect, 1.6)),
    [viewBox, aspect, still, clip],
  );
  const unit = Math.max(box.width, box.height);
  const centreX = box.x + box.width / 2;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, { aspectRatio: aspect }, style]}
    >
      <Svg width="100%" height="100%" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}>
        {still ? (
          <G>
            {still.start ? <SkeletonFigure frame={still.start} viewBox={box} mirror={mirror} opacity={0.28} /> : null}
            <SkeletonFigure frame={still.end} viewBox={box} mirror={mirror} />
            <G transform={mirror ? `matrix(-1 0 0 1 ${2 * centreX} 0)` : undefined}>
              {still.paths.map((path, k) => (
                <G key={k}>
                  <Polyline
                    points={path.points.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke={colors.primary}
                    strokeWidth={unit * 0.016}
                    strokeDasharray={`${unit * 0.03} ${unit * 0.022}`}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Path d={path.arrow} fill={colors.primary} />
                </G>
              ))}
            </G>
          </G>
        ) : null}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%' },
});
