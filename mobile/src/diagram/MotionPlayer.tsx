import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg from 'react-native-svg';

import { useTheme } from '@/theme';

import { fitViewBox, signingViewBox, type DiagramFocus, type SkeletonFrame, type ViewBox } from './skeleton';
import { SkeletonFigure } from './SkeletonFigure';
import { buildTimeline, sampleTimeline, type MotionClip } from './timeline';
import { useAnimationFrames } from './useAnimationFrames';

/** Recorded frames per second: the speed of the recordings at 1×. */
export const MOTION_FPS = 15;
/** Pause at the end before a loop starts again (frames). */
const LOOP_PAUSE_FRAMES = 8;

export interface SeekRequest {
  item: number;
  /** Changes on every request, so the same item can be chosen twice. Later requests have larger nonces. */
  nonce: number;
}

let seekCounter = 0;
/** A nonce for a new SeekRequest. */
export function nextSeekNonce(): number {
  seekCounter += 1;
  return seekCounter;
}

interface Props {
  /** One clip per item; null for items with nothing to show (they are skipped). */
  clips: readonly (MotionClip | null)[];
  playing: boolean;
  /** 1 = as recorded. */
  speed?: number;
  loop?: boolean;
  mirror?: boolean;
  seek?: SeekRequest | null;
  /** The item on screen changed. */
  onItem?: (item: number) => void;
  /** Reached the end and stopped there (not called when looping). To play again, seek. */
  onEnd?: () => void;
  focus?: DiagramFocus;
  /** Area shown; by default the area the hands use, fixed for the whole sequence. */
  viewBox?: ViewBox;
  aspect?: number;
  showProgress?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Plays recorded signs one after another as a single smooth movement (see
 * timeline.ts), drawing in-between positions on every display frame.
 */
export function MotionPlayer({
  clips,
  playing,
  speed = 1,
  loop = false,
  mirror = false,
  seek,
  onItem,
  onEnd,
  focus = 'body',
  viewBox,
  aspect = 1,
  showProgress = false,
  accessibilityLabel,
  style,
  testID,
}: Props) {
  const { colors, radii } = useTheme();
  const timeline = useMemo(() => buildTimeline(clips), [clips]);
  const box = useMemo(() => {
    if (viewBox) return fitViewBox(viewBox, aspect);
    // One view for everything that plays, so the picture does not jump between signs.
    const shown: SkeletonFrame[] = [];
    for (const segment of timeline.segments) {
      if (segment.kind === 'play') shown.push(...clips[segment.item]!.skeletons.slice(segment.from, segment.to + 1));
    }
    return signingViewBox(shown, aspect);
  }, [viewBox, aspect, timeline, clips]);
  const firstStart = timeline.starts.find((s) => s !== null) ?? 0;
  const [time, setTime] = useState(0);
  // A new seek request moves the playhead (adjusting state while rendering, not in an effect).
  const [seekSeen, setSeekSeen] = useState<number | null>(null);
  if (seek && seek.nonce !== seekSeen) {
    setSeekSeen(seek.nonce);
    setTime(timeline.starts[seek.item] ?? firstStart);
  }
  // The clock runs in a ref, so every display frame advances it even when React batches renders;
  // it takes over the rendered time whenever a new seek was made.
  const clock = useRef<{ time: number; seek: number | null; ended: boolean }>({ time: 0, seek: null, ended: false });
  const shownItem = useRef<number | null>(null);

  useAnimationFrames(playing && timeline.duration > 0, (elapsedMs) => {
    const c = clock.current;
    if (c.seek !== seekSeen) {
      c.seek = seekSeen;
      c.time = time;
      c.ended = false;
    }
    let t = c.time + (elapsedMs / 1000) * MOTION_FPS * speed;
    if (loop) {
      if (t >= timeline.duration + LOOP_PAUSE_FRAMES) t = 0;
    } else if (t >= timeline.duration) {
      t = timeline.duration;
      if (!c.ended) {
        c.ended = true;
        onEnd?.();
      }
    }
    c.time = t;
    setTime(t);
  });

  const point = sampleTimeline(timeline, clips, Math.min(time, timeline.duration));

  useEffect(() => {
    if (!point || point.item === shownItem.current) return;
    shownItem.current = point.item;
    onItem?.(point.item);
  });

  return (
    <View testID={testID} style={style}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={[styles.stage, { aspectRatio: aspect }]}
      >
        <Svg width="100%" height="100%" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}>
          {point ? <SkeletonFigure frame={point.frame} viewBox={box} focus={focus} mirror={mirror} /> : null}
        </Svg>
      </View>
      {showProgress && timeline.duration > 0 ? (
        <View style={[styles.track, { backgroundColor: colors.outline, borderRadius: radii.pill }]}>
          <View
            testID={testID ? `${testID}-progress` : undefined}
            style={[
              styles.fill,
              {
                width: `${Math.min(100, (time / timeline.duration) * 100)}%`,
                backgroundColor: colors.primary,
                borderRadius: radii.pill,
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%' },
  track: { height: 4, marginHorizontal: 16, marginBottom: 10, overflow: 'hidden' },
  fill: { height: 4 },
});
