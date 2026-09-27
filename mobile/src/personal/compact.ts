import {
  COORDS,
  FRAME_DIM,
  LEFT_HAND_PRESENT_INDEX,
  LEFT_HAND_START,
  POSE_START,
  RIGHT_HAND_PRESENT_INDEX,
  RIGHT_HAND_START,
} from '@/recognition/featureSpec';

/**
 * Compact per-frame description used for matching (not stored).
 *
 * Per hand: presence, wrist position (body-centred, shoulder widths) and ten
 * finger points relative to the wrist, scaled by hand size (so handshape does
 * not depend on distance to the camera). Plus both elbows. Only x/y are used:
 * MediaPipe's depth estimate is too noisy to compare repetitions.
 */

/** Finger tips (4, 8, 12, 16, 20) and middle joints (3, 6, 10, 14, 18) of MediaPipe's hand model. */
const HAND_POINTS = [4, 8, 12, 16, 20, 3, 6, 10, 14, 18] as const;
/** Wrist → middle-finger knuckle: the hand size unit. */
const HAND_SIZE_POINT = 9;
const MIN_HAND_SIZE = 1e-3;

const WEIGHT_PRESENCE = 2;
const WEIGHT_WRIST = 1.5;
const WEIGHT_SHAPE = 0.6;
const WEIGHT_ELBOW = 0.5;

const HAND_DIMS = 1 + 2 + HAND_POINTS.length * 2;
export const COMPACT_DIM = HAND_DIMS * 2 + 4;

const LEFT_ELBOW_SLOT = 3;
const RIGHT_ELBOW_SLOT = 4;

function writeHand(values: ArrayLike<number>, start: number, present: boolean, out: Float32Array, at: number, mirror: boolean) {
  if (!present) return; // zeros: absent
  const sx = mirror ? -1 : 1;
  const wx = values[start]!;
  const wy = values[start + 1]!;
  const kx = values[start + HAND_SIZE_POINT * COORDS]! - wx;
  const ky = values[start + HAND_SIZE_POINT * COORDS + 1]! - wy;
  const size = Math.max(Math.hypot(kx, ky), MIN_HAND_SIZE);
  out[at] = WEIGHT_PRESENCE;
  out[at + 1] = sx * wx * WEIGHT_WRIST;
  out[at + 2] = wy * WEIGHT_WRIST;
  HAND_POINTS.forEach((point, k) => {
    const px = values[start + point * COORDS]! - wx;
    const py = values[start + point * COORDS + 1]! - wy;
    out[at + 3 + k * 2] = ((sx * px) / size) * WEIGHT_SHAPE;
    out[at + 4 + k * 2] = (py / size) * WEIGHT_SHAPE;
  });
}

/**
 * @param mirror describe the frame as if signed with the other hand (swap hands, flip x),
 *   so a left-handed signer matches a right-handed recording.
 */
export function compactFrame(values: ArrayLike<number>, mirror = false): Float32Array {
  const out = new Float32Array(COMPACT_DIM);
  if (values.length !== FRAME_DIM) return out;
  const left = (values[LEFT_HAND_PRESENT_INDEX] ?? 0) > 0.5;
  const right = (values[RIGHT_HAND_PRESENT_INDEX] ?? 0) > 0.5;
  // Mirroring swaps which hand goes into which slot.
  writeHand(values, mirror ? RIGHT_HAND_START : LEFT_HAND_START, mirror ? right : left, out, 0, mirror);
  writeHand(values, mirror ? LEFT_HAND_START : RIGHT_HAND_START, mirror ? left : right, out, HAND_DIMS, mirror);

  const sx = mirror ? -1 : 1;
  const [first, second] = mirror ? [RIGHT_ELBOW_SLOT, LEFT_ELBOW_SLOT] : [LEFT_ELBOW_SLOT, RIGHT_ELBOW_SLOT];
  const e = HAND_DIMS * 2;
  out[e] = sx * values[POSE_START + first * COORDS]! * WEIGHT_ELBOW;
  out[e + 1] = values[POSE_START + first * COORDS + 1]! * WEIGHT_ELBOW;
  out[e + 2] = sx * values[POSE_START + second * COORDS]! * WEIGHT_ELBOW;
  out[e + 3] = values[POSE_START + second * COORDS + 1]! * WEIGHT_ELBOW;
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i]!)) out[i] = 0;
  return out;
}

/**
 * Distance between two compact frames, ignoring which hand slot each hand is in.
 *
 * MediaPipe's left/right hand label can flip between frames (and the pose
 * model's wrists are unreliable when a hand hides the arms), so frames are
 * compared both as labelled and with the two hand slots exchanged, and the
 * closer reading counts. Positions and shapes are still compared, so a
 * two-handed sign must still match hand for hand.
 */
export function frameDistance(a: Float32Array, b: Float32Array): number {
  let keep = 0;
  let swap = 0;
  for (let i = 0; i < HAND_DIMS; i++) {
    const a0 = a[i]!;
    const a1 = a[i + HAND_DIMS]!;
    const b0 = b[i]!;
    const b1 = b[i + HAND_DIMS]!;
    keep += (a0 - b0) * (a0 - b0) + (a1 - b1) * (a1 - b1);
    swap += (a0 - b1) * (a0 - b1) + (a1 - b0) * (a1 - b0);
  }
  let rest = 0;
  for (let i = HAND_DIMS * 2; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    rest += d * d;
  }
  return Math.sqrt(Math.min(keep, swap) + rest);
}
