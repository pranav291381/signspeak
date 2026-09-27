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
}

export interface SkeletonFrame {
  body: BodyPoints | null;
  left: Point[] | null;
  right: Point[] | null;
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
