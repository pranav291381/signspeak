import { signingViewBox, type Point, type SkeletonFrame, type ViewBox } from './skeleton';
import type { MotionClip } from './timeline';

/** Geometry of a still diagram of a recorded sign (drawn by SignStill.tsx). */

export interface HandPath {
  points: Point[];
  /** SVG path of the arrowhead at the end of the movement. */
  arrow: string;
}

export interface Still {
  /** Where the hands start, or null when they end where they started. */
  start: SkeletonFrame | null;
  end: SkeletonFrame;
  paths: HandPath[];
  /** The frames of the sign itself (its core), e.g. to frame the picture. */
  frames: readonly SkeletonFrame[];
}

/** The middle knuckle: where "the hand" is. */
const TRACK_POINT = 9;
/** Movements shorter than this (body units) get no path: the hand holds its place. */
const MIN_PATH_LENGTH = 0.18;
/** Points closer together than this are merged, so the dashes stay even. */
const MIN_STEP = 0.02;
const ARROW_SIZE = 0.1;

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function handPath(frames: readonly SkeletonFrame[], side: 'left' | 'right'): HandPath | null {
  const points: Point[] = [];
  for (const frame of frames) {
    const hand = frame[side];
    if (!hand || (frame[side === 'left' ? 'leftAlpha' : 'rightAlpha'] ?? 1) < 0.5) continue;
    const p = hand[TRACK_POINT]!;
    if (points.length === 0 || distance(points[points.length - 1]!, p) >= MIN_STEP) points.push([p[0], p[1]]);
  }
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1]!, points[i]!);
  if (points.length < 2 || length < MIN_PATH_LENGTH) return null;

  // The arrow points along the last stretch of the path.
  const tip = points[points.length - 1]!;
  let back = points[points.length - 2]!;
  for (let i = points.length - 2; i >= 0 && distance(points[i]!, tip) < ARROW_SIZE; i--) back = points[i]!;
  const d = distance(back, tip) || 1;
  const dx = (tip[0] - back[0]) / d;
  const dy = (tip[1] - back[1]) / d;
  const baseX = tip[0] - dx * ARROW_SIZE;
  const baseY = tip[1] - dy * ARROW_SIZE;
  const half = ARROW_SIZE * 0.6;
  const arrow = `M${tip[0]},${tip[1]} L${baseX - dy * half},${baseY + dx * half} L${baseX + dy * half},${baseY - dx * half} Z`;
  return { points, arrow };
}

function sameHands(a: SkeletonFrame, b: SkeletonFrame): boolean {
  for (const side of ['left', 'right'] as const) {
    const ha = a[side];
    const hb = b[side];
    if (!ha !== !hb) return false;
    if (ha && hb && ha.some((p, k) => distance(p, hb[k]!) > 0.08)) return false;
  }
  return true;
}

export function stillOf(clip: MotionClip): Still | null {
  const { skeletons, span } = clip;
  if (skeletons.length === 0) return null;
  const from = Math.min(span?.coreStart ?? 0, skeletons.length - 1);
  const to = Math.max(from, Math.min(span?.coreEnd ?? skeletons.length - 1, skeletons.length - 1));
  const core = skeletons.slice(from, to + 1);
  const start = skeletons[from]!;
  const end = skeletons[to]!;
  const paths = (['left', 'right'] as const).map((side) => handPath(core, side)).filter((p): p is HandPath => p !== null);
  return { start: sameHands(start, end) ? null : start, end, paths, frames: core };
}

/** The view of a sign's still diagram (and of the sign played on its own in the same place). */
export function stillViewBox(clip: MotionClip, aspect = 1): ViewBox {
  const still = stillOf(clip);
  return signingViewBox(still ? still.frames : clip.skeletons, aspect, 1.6);
}
