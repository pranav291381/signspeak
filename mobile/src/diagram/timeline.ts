import type { SignSpan } from '@/motion/segment';

import { lerpSkeleton, type SkeletonFrame } from './skeleton';

/**
 * Plays several recorded signs as one movement, the way they are signed in a
 * row: each sign from where its hands arrive to where they start to drop
 * (its core), with a short, eased glide from one sign into the next. The first
 * sign starts from rest and the last one returns to rest. Time is counted in
 * recorded frames (15 per second at normal speed).
 */

export interface MotionClip {
  skeletons: readonly SkeletonFrame[];
  span: SignSpan | null;
}

export type TimelineSegment =
  | { kind: 'play'; item: number; from: number; to: number; t0: number; t1: number }
  | { kind: 'glide'; item: number; fromItem: number; fromFrame: number; toFrame: number; t0: number; t1: number };

export interface Timeline {
  segments: TimelineSegment[];
  /** Total length in frames. */
  duration: number;
  /** When each item's own movement starts; null for items with nothing to play. */
  starts: (number | null)[];
}

/** Length of the glide between two signs, in frames (0.4 s at normal speed). */
export const GLIDE_FRAMES = 6;

export function buildTimeline(clips: readonly (MotionClip | null)[]): Timeline {
  const playable = clips.map((clip, i) => (clip && clip.skeletons.length > 0 ? i : -1)).filter((i) => i >= 0);
  const segments: TimelineSegment[] = [];
  const starts: (number | null)[] = clips.map(() => null);
  let t = 0;
  playable.forEach((item, k) => {
    const clip = clips[item]!;
    const last = clip.skeletons.length - 1;
    const from = k === 0 ? 0 : Math.min(clip.span?.coreStart ?? 0, last);
    const to = k === playable.length - 1 ? last : Math.max(from, Math.min(clip.span?.coreEnd ?? last, last));
    if (k > 0) {
      const previous = segments[segments.length - 1] as Extract<TimelineSegment, { kind: 'play' }>;
      segments.push({ kind: 'glide', item, fromItem: previous.item, fromFrame: previous.to, toFrame: from, t0: t, t1: t + GLIDE_FRAMES });
      t += GLIDE_FRAMES;
    }
    starts[item] = t;
    segments.push({ kind: 'play', item, from, to, t0: t, t1: t + (to - from) });
    t += to - from;
  });
  return { segments, duration: t, starts };
}

function segmentAt(timeline: Timeline, t: number): TimelineSegment | undefined {
  const { segments } = timeline;
  for (const segment of segments) if (t <= segment.t1) return segment;
  return segments[segments.length - 1];
}

/** Slow in, slow out. */
const ease = (s: number) => s * s * (3 - 2 * s);

export interface TimelinePoint {
  frame: SkeletonFrame;
  /** The item being signed (during a glide, the one it is closer to). */
  item: number;
}

export function sampleTimeline(timeline: Timeline, clips: readonly (MotionClip | null)[], t: number): TimelinePoint | null {
  const segment = segmentAt(timeline, Math.max(0, Math.min(t, timeline.duration)));
  if (!segment) return null;
  if (segment.kind === 'glide') {
    const s = segment.t1 > segment.t0 ? (t - segment.t0) / (segment.t1 - segment.t0) : 1;
    const a = clips[segment.fromItem]!.skeletons[segment.fromFrame]!;
    const b = clips[segment.item]!.skeletons[segment.toFrame]!;
    return { frame: lerpSkeleton(a, b, ease(Math.max(0, Math.min(1, s)))), item: s < 0.5 ? segment.fromItem : segment.item };
  }
  const skeletons = clips[segment.item]!.skeletons;
  const position = segment.from + Math.max(0, Math.min(t - segment.t0, segment.to - segment.from));
  const index = Math.floor(position);
  const next = Math.min(index + 1, segment.to);
  return { frame: lerpSkeleton(skeletons[index]!, skeletons[next]!, position - index), item: segment.item };
}
