import { act, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { clipFromFrames } from '@/motion/library';
import { frameFor, MOTIONS, perform } from '@/test-utils/landmarks';

import { MotionPlayer, nextSeekNonce } from '../MotionPlayer';
import { SignStill } from '../SignStill';
import { fitViewBox, lerpSkeleton, SIGNING_SPACE, skeletonFrame } from '../skeleton';
import { stillOf } from '../still';
import { buildTimeline, GLIDE_FRAMES, sampleTimeline, type MotionClip } from '../timeline';

jest.mock('@/accessibility/useReduceMotion', () => ({ useReduceMotion: () => false }));

beforeAll(() => {
  initI18n('en');
});

const clipOf = (motion: keyof typeof MOTIONS, durationMs = 1000) =>
  clipFromFrames(perform(MOTIONS[motion]!, { durationMs, restBeforeMs: 300, restAfterMs: 300, noise: 0 }).map((f) => f.values!));

describe('lerpSkeleton', () => {
  const a = skeletonFrame(frameFor({ right: { x: -0.6, y: 0, curl: [0, 0, 0, 0, 0] } }));
  const b = skeletonFrame(frameFor({ right: { x: -0.2, y: 0.4, curl: [0, 0, 0, 0, 0] }, left: { x: 0.3, y: 0, curl: [1, 1, 1, 1, 1] } }));

  it('moves every point in a straight line', () => {
    const mid = lerpSkeleton(a, b, 0.5);
    expect(mid.right![0]![0]).toBeCloseTo(-0.4, 5);
    expect(mid.right![0]![1]).toBeCloseTo(0.2, 5);
    expect(lerpSkeleton(a, b, 0)).toBe(a);
    expect(lerpSkeleton(a, b, 1)).toBe(b);
  });

  it('fades a hand that is in only one of the frames', () => {
    const quarter = lerpSkeleton(a, b, 0.25);
    expect(quarter.left).toBe(b.left);
    expect(quarter.leftAlpha).toBeCloseTo(0.25, 5);
    expect(lerpSkeleton(b, a, 0.25).leftAlpha).toBeCloseTo(0.75, 5);
  });
});

describe('fitViewBox', () => {
  it('keeps the signing space centred at any aspect', () => {
    const wide = fitViewBox(SIGNING_SPACE, 2);
    expect(wide.width / wide.height).toBeCloseTo(2, 6);
    expect(wide.x + wide.width / 2).toBeCloseTo(SIGNING_SPACE.x + SIGNING_SPACE.width / 2, 6);
    expect(wide.height).toBeCloseTo(SIGNING_SPACE.height, 6);
  });
});

describe('timeline', () => {
  const wave = clipOf('wave');
  const knock = clipOf('knock');

  it('plays one sign whole, from rest to rest', () => {
    const timeline = buildTimeline([wave]);
    expect(timeline.duration).toBe(wave.skeletons.length - 1);
    expect(timeline.starts).toEqual([0]);
  });

  it('joins signs core to core with a glide, skipping items with nothing to play', () => {
    const timeline = buildTimeline([wave, null, knock]);
    const [first, glide, second] = timeline.segments;
    expect(first).toEqual(expect.objectContaining({ kind: 'play', item: 0, from: 0, to: wave.span!.coreEnd }));
    expect(glide).toEqual(expect.objectContaining({ kind: 'glide', item: 2, fromItem: 0, fromFrame: wave.span!.coreEnd, toFrame: knock.span!.coreStart }));
    expect(glide!.t1 - glide!.t0).toBe(GLIDE_FRAMES);
    expect(second).toEqual(expect.objectContaining({ kind: 'play', item: 2, from: knock.span!.coreStart, to: knock.skeletons.length - 1 }));
    expect(timeline.starts).toEqual([0, null, glide!.t1]);
    expect(timeline.duration).toBe(second!.t1);
  });

  it('samples in-between positions and names the sign being made', () => {
    const clips: MotionClip[] = [wave, knock];
    const timeline = buildTimeline(clips);
    const glide = timeline.segments[1]!;
    const start = sampleTimeline(timeline, clips, 0)!;
    expect(start.item).toBe(0);
    expect(start.frame).toBe(wave.skeletons[0]);
    const half = sampleTimeline(timeline, clips, 0.5)!;
    expect(half.frame.body!.nose[0]).toBeCloseTo((wave.skeletons[0]!.body!.nose[0] + wave.skeletons[1]!.body!.nose[0]) / 2, 5);
    expect(sampleTimeline(timeline, clips, glide.t0 + 1)!.item).toBe(0);
    expect(sampleTimeline(timeline, clips, glide.t1 - 1)!.item).toBe(1);
    expect(sampleTimeline(timeline, clips, timeline.duration + 5)!.frame).toBe(knock.skeletons[knock.skeletons.length - 1]);
    expect(sampleTimeline(buildTimeline([null]), [null], 0)).toBeNull();
  });
});

describe('still diagrams', () => {
  it('shows where the hand starts and ends, and the path it takes', () => {
    const still = stillOf(clipOf('point_arc'))!;
    expect(still.start).not.toBeNull();
    expect(still.paths).toHaveLength(1);
    expect(still.paths[0]!.points.length).toBeGreaterThan(3);
    expect(still.paths[0]!.arrow).toMatch(/^M.+Z$/);
  });

  it('draws no path for a held handshape', () => {
    const still = stillOf(clipOf('hold_fist'))!;
    expect(still.paths).toEqual([]);
    expect(still.start).toBeNull();
    expect(stillOf({ skeletons: [], span: null })).toBeNull();
  });

  it('is one image for screen readers', () => {
    render(<SignStill clip={clipOf('wave')} mirror accessibilityLabel="Hand diagram of the sign for hello" />);
    expect(screen.getByRole('image', { name: 'Hand diagram of the sign for hello' })).toBeOnTheScreen();
  });
});

describe('MotionPlayer', () => {
  afterEach(() => jest.useRealTimers());

  it('plays the signs in order and says when it reaches the end', () => {
    jest.useFakeTimers();
    const clips = [clipOf('wave'), clipOf('knock')];
    const duration = buildTimeline(clips).duration;
    const onItem = jest.fn();
    const onEnd = jest.fn();
    render(<MotionPlayer clips={clips} playing onItem={onItem} onEnd={onEnd} showProgress testID="player" accessibilityLabel="Signs" />);
    expect(onItem).toHaveBeenLastCalledWith(0);
    act(() => jest.advanceTimersByTime(((duration + 2) / 15) * 1000));
    expect(onItem).toHaveBeenLastCalledWith(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('player-progress')).toHaveStyle({ width: '100%' });
  });

  it('plays faster at a higher speed, and loops instead of ending', () => {
    jest.useFakeTimers();
    const clips = [clipOf('wave'), clipOf('knock')];
    const duration = buildTimeline(clips).duration;
    const onEnd = jest.fn();
    const onItem = jest.fn();
    render(<MotionPlayer clips={clips} playing loop speed={2} onItem={onItem} onEnd={onEnd} accessibilityLabel="Signs" />);
    act(() => jest.advanceTimersByTime(((duration / 2 + 1) / 15) * 1000));
    expect(onItem).toHaveBeenLastCalledWith(1);
    act(() => jest.advanceTimersByTime((12 / 15) * 1000));
    expect(onEnd).not.toHaveBeenCalled();
    expect(onItem).toHaveBeenLastCalledWith(0);
  });

  it('jumps to a sign on request and stays still while paused', () => {
    jest.useFakeTimers();
    const clips = [clipOf('wave'), clipOf('knock')];
    const onItem = jest.fn();
    const { rerender } = render(<MotionPlayer clips={clips} playing={false} onItem={onItem} accessibilityLabel="Signs" />);
    rerender(<MotionPlayer clips={clips} playing={false} seek={{ item: 1, nonce: nextSeekNonce() }} onItem={onItem} accessibilityLabel="Signs" />);
    expect(onItem).toHaveBeenLastCalledWith(1);
    act(() => jest.advanceTimersByTime(2000));
    expect(onItem).toHaveBeenCalledTimes(2);
  });
});
