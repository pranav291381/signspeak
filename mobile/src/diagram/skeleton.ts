import { REST_WRIST_Y } from '@/recognition/features';
import {
  COORDS,
  FRAME_DIM,
  HAND_LANDMARK_COUNT,
  LEFT_HAND_PRESENT_INDEX,
  LEFT_HAND_START,
  POSE_PRESENT_INDEX,
  POSE_START,
  RIGHT_HAND_PRESENT_INDEX,
  RIGHT_HAND_START,
} from '@/recognition/featureSpec';

/** Geometry for drawing one landmark frame (body-centred units, y down, as the camera saw it). */

export type Point = [number, number];

export interface BodyPoints {
  nose: Point;
  leftShoulder: Point;
  rightShoulder: Point;
  leftElbow: Point;
  rightElbow: Point;
  leftWrist: Point;
  rightWrist: Point;
  leftHip: Point;
  rightHip: Point;
}

export interface SkeletonFrame {
  body: BodyPoints | null;
  left: Point[] | null;
  right: Point[] | null;
  /** Opacity of each hand (1 when left out), for hands fading in or out between frames. */
  leftAlpha?: number;
  rightAlpha?: number;
}

/** MediaPipe hand connections with the finger they belong to (0 thumb … 4 little, 5 palm). */
export const HAND_BONES: readonly [number, number, number][] = [
  [0, 1, 0], [1, 2, 0], [2, 3, 0], [3, 4, 0],
  [0, 5, 5], [5, 6, 1], [6, 7, 1], [7, 8, 1],
  [9, 10, 2], [10, 11, 2], [11, 12, 2],
  [13, 14, 3], [14, 15, 3], [15, 16, 3],
  [0, 17, 5], [17, 18, 4], [18, 19, 4], [19, 20, 4],
  [5, 9, 5], [9, 13, 5], [13, 17, 5],
];
export const FINGERTIPS = [4, 8, 12, 16, 20] as const;

function point(values: ArrayLike<number>, index: number): Point {
  return [values[index]!, values[index + 1]!];
}

function hand(values: ArrayLike<number>, start: number): Point[] {
  return Array.from({ length: HAND_LANDMARK_COUNT }, (_, k) => point(values, start + k * COORDS));
}

const poseSlot = (slot: number) => POSE_START + slot * COORDS;

export function skeletonFrame(values: ArrayLike<number> | null): SkeletonFrame {
  if (!values || values.length !== FRAME_DIM) return { body: null, left: null, right: null };
  const body =
    (values[POSE_PRESENT_INDEX] ?? 0) > 0.5
      ? {
          nose: point(values, poseSlot(0)),
          leftShoulder: point(values, poseSlot(1)),
          rightShoulder: point(values, poseSlot(2)),
          leftElbow: point(values, poseSlot(3)),
          rightElbow: point(values, poseSlot(4)),
          leftWrist: point(values, poseSlot(5)),
          rightWrist: point(values, poseSlot(6)),
          leftHip: point(values, poseSlot(7)),
          rightHip: point(values, poseSlot(8)),
        }
      : null;
  return {
    body,
    left: (values[LEFT_HAND_PRESENT_INDEX] ?? 0) > 0.5 ? hand(values, LEFT_HAND_START) : null,
    right: (values[RIGHT_HAND_PRESENT_INDEX] ?? 0) > 0.5 ? hand(values, RIGHT_HAND_START) : null,
  };
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DiagramFocus = 'body' | 'hands';

/**
 * The signing space, waist up with room above the head, in body units
 * (shoulders at y 0 and one shoulder width apart, hips about 1.6 below). Recorded
 * signs are all shown in this one frame, so a sentence plays without the view
 * jumping from sign to sign.
 */
export const SIGNING_SPACE: ViewBox = { x: -1.6, y: -1.45, width: 3.2, height: 3.2 };

/**
 * Where to look for recorded signs: the area the hands use over `frames`
 * (plus head and shoulders), padded, at least `minSize` across and never more
 * than the whole signing space. One box for a whole sentence keeps the view
 * still while it plays.
 */
export function signingViewBox(frames: readonly SkeletonFrame[], aspect = 1, minSize = 2.2): ViewBox {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = ([x, y]: Point) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  };
  for (const frame of frames) {
    for (const hand of [frame.left, frame.right]) {
      // Only hands raised to sign widen the view, not a hand resting low.
      if (hand && hand[0]![1] < REST_WRIST_Y) hand.forEach(add);
    }
    if (frame.body) {
      add(frame.body.leftShoulder);
      add(frame.body.rightShoulder);
      add([frame.body.nose[0], frame.body.nose[1] - 0.4]);
    }
  }
  if (xs.length === 0) return fitViewBox(SIGNING_SPACE, aspect);
  const pad = 0.25;
  const clamp = (lo: number, hi: number, min: number, max: number) => {
    const size = Math.min(Math.max(hi - lo + 2 * pad, minSize), max);
    const mid = (lo + hi) / 2;
    return [mid - size / 2, size] as const;
  };
  const [x, width] = clamp(Math.min(...xs), Math.max(...xs), minSize, SIGNING_SPACE.width);
  const [y, height] = clamp(Math.min(...ys), Math.max(...ys), minSize, SIGNING_SPACE.height);
  return fitViewBox({ x, y, width, height }, aspect);
}

/** `box` widened or heightened around its centre to `aspect` (width / height). */
export function fitViewBox(box: ViewBox, aspect: number): ViewBox {
  let { width, height } = box;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

/**
 * Area to show: the hands over the whole sequence (`hands`), or hands plus
 * head and shoulders (`body`), padded and fitted to `aspect` (width / height).
 */
export function diagramViewBox(frames: readonly SkeletonFrame[], focus: DiagramFocus, aspect = 1): ViewBox {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = ([x, y]: Point) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  };
  for (const frame of frames) {
    frame.left?.forEach(add);
    frame.right?.forEach(add);
    if (focus === 'body' && frame.body) {
      add(frame.body.leftShoulder);
      add(frame.body.rightShoulder);
      add([frame.body.nose[0], frame.body.nose[1] - 0.35]);
      add(frame.body.leftElbow);
      add(frame.body.rightElbow);
    }
  }
  if (xs.length === 0) {
    // Default framing: head and shoulders.
    xs.push(-1, 1);
    ys.push(-1.2, 1);
  }
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const minSize = focus === 'hands' ? 0.9 : 2;
  const pad = focus === 'hands' ? 0.2 : 0.15;
  let width = Math.max(maxX - minX, minSize) * (1 + 2 * pad);
  let height = Math.max(maxY - minY, minSize) * (1 + 2 * pad);
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  minX = cx - width / 2;
  minY = cy - height / 2;
  return { x: minX, y: minY, width, height };
}

/** Frame to show when not animating: the middle of the part with hands. */
export function keyFrameIndex(frames: readonly SkeletonFrame[]): number {
  const withHands = frames.map((f, i) => (f.left || f.right ? i : -1)).filter((i) => i >= 0);
  if (withHands.length === 0) return Math.floor(frames.length / 2);
  return withHands[Math.floor(withHands.length / 2)]!;
}

const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
const lerpPoint = (a: Point, b: Point, s: number): Point => [lerp(a[0], b[0], s), lerp(a[1], b[1], s)];
const lerpPoints = (a: Point[], b: Point[], s: number): Point[] => a.map((p, k) => lerpPoint(p, b[k]!, s));

function lerpBody(a: BodyPoints, b: BodyPoints, s: number): BodyPoints {
  const out = {} as BodyPoints;
  for (const key of Object.keys(a) as (keyof BodyPoints)[]) out[key] = lerpPoint(a[key], b[key], s);
  return out;
}

function lerpHand(
  a: Point[] | null,
  b: Point[] | null,
  alphaA: number,
  alphaB: number,
  s: number,
): { points: Point[] | null; alpha: number } {
  if (a && b) return { points: lerpPoints(a, b, s), alpha: lerp(alphaA, alphaB, s) };
  // Only one side has the hand: it stays where it is and fades.
  if (a) return { points: a, alpha: alphaA * (1 - s) };
  if (b) return { points: b, alpha: alphaB * s };
  return { points: null, alpha: 0 };
}

/**
 * The frame `s` (0–1) of the way from `a` to `b`: every point moves in a
 * straight line, and a hand that is in only one of them fades out or in.
 */
export function lerpSkeleton(a: SkeletonFrame, b: SkeletonFrame, s: number): SkeletonFrame {
  if (s <= 0) return a;
  if (s >= 1) return b;
  const left = lerpHand(a.left, b.left, a.leftAlpha ?? 1, b.leftAlpha ?? 1, s);
  const right = lerpHand(a.right, b.right, a.rightAlpha ?? 1, b.rightAlpha ?? 1, s);
  return {
    body: a.body && b.body ? lerpBody(a.body, b.body, s) : s < 0.5 ? a.body : b.body,
    left: left.points,
    right: right.points,
    leftAlpha: left.alpha,
    rightAlpha: right.alpha,
  };
}
