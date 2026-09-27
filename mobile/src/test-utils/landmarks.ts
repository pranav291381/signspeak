/**
 * Synthetic landmark frames for tests: a simple articulated hand (five fingers
 * with adjustable curl) at a given wrist position, plus an upper body. Not a
 * model of any real ISL sign — only distinct, repeatable shapes and movements.
 */
import {
  COORDS,
  FRAME_DIM,
  LEFT_HAND_PRESENT_INDEX,
  LEFT_HAND_START,
  POSE_PRESENT_INDEX,
  RIGHT_HAND_PRESENT_INDEX,
  RIGHT_HAND_START,
} from '@/recognition/featureSpec';
import type { LandmarkFrame } from '@/recognition/types';

export interface HandPose {
  x: number;
  y: number;
  /** Curl of thumb, index, middle, ring, little: 0 straight … 1 fully bent. */
  curl: [number, number, number, number, number];
  /** Direction the fingers point, radians (−π/2 = up). */
  angle?: number;
  size?: number;
  /** Reflected left-right around the wrist (the other hand's version of the shape). */
  mirrored?: boolean;
}

export interface Pose {
  right?: HandPose | null;
  left?: HandPose | null;
}

/** Deterministic PRNG (mulberry32) so tests never flake. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function handPoints(hand: HandPose): [number, number][] {
  const size = hand.size ?? 0.4;
  const base = hand.angle ?? -Math.PI / 2;
  const points: [number, number][] = [[hand.x, hand.y]];
  // Knuckle spread across the palm; thumb starts low and to the side.
  const offsets = [-0.55, -0.25, 0, 0.22, 0.42];
  const lengths = [0.32, 0.38, 0.42, 0.38, 0.3];
  for (let f = 0; f < 5; f++) {
    const spread = base + offsets[f]! * (f === 0 ? 1.6 : 0.5);
    const knuckleDistance = f === 0 ? 0.35 : 0.9;
    let px = hand.x + Math.cos(spread) * knuckleDistance * size;
    let py = hand.y + Math.sin(spread) * knuckleDistance * size;
    points.push([px, py]);
    let direction = spread;
    for (let joint = 0; joint < 3; joint++) {
      direction += hand.curl[f]! * (Math.PI / 2.4) * (f === 0 ? -1 : 1);
      px += Math.cos(direction) * lengths[f]! * size;
      py += Math.sin(direction) * lengths[f]! * size;
      points.push([px, py]);
    }
  }
  // 1 + 5 × 4 = 21, in MediaPipe order
  return hand.mirrored ? points.map(([x, y]) => [2 * hand.x - x, y]) : points;
}

/** One spec-v1 frame for `pose`, with optional Gaussian jitter (shoulder-width units). */
export function frameFor(pose: Pose, noise = 0, random: () => number = Math.random): Float32Array {
  const v = new Float32Array(FRAME_DIM);
  const body: [number, number][] = [
    [0, -0.8],
    [0.5, 0],
    [-0.5, 0],
    [0.6, 0.7],
    [-0.6, 0.7],
    [0.55, 1.2],
    [-0.55, 1.2],
    [0.35, 1.8],
    [-0.35, 1.8],
  ];
  // Wrists and elbows follow the hands when they are raised.
  if (pose.left) {
    body[5] = [pose.left.x, pose.left.y];
    body[3] = [(0.5 + pose.left.x) / 2 + 0.15, (0 + pose.left.y) / 2 + 0.3];
  }
  if (pose.right) {
    body[6] = [pose.right.x, pose.right.y];
    body[4] = [(-0.5 + pose.right.x) / 2 - 0.15, (0 + pose.right.y) / 2 + 0.3];
  }
  const jitter = () => (noise > 0 ? gaussian(random) * noise : 0);
  body.forEach(([x, y], k) => {
    v[k * COORDS] = x + jitter();
    v[k * COORDS + 1] = y + jitter();
  });
  v[POSE_PRESENT_INDEX] = 1;
  const writeHand = (hand: HandPose | null | undefined, start: number, flag: number) => {
    if (!hand) return;
    handPoints(hand).forEach(([x, y], k) => {
      v[start + k * COORDS] = x + jitter();
      v[start + k * COORDS + 1] = y + jitter();
    });
    v[flag] = 1;
  };
  writeHand(pose.left, LEFT_HAND_START, LEFT_HAND_PRESENT_INDEX);
  writeHand(pose.right, RIGHT_HAND_START, RIGHT_HAND_PRESENT_INDEX);
  return v;
}

/** Keyframes of a movement; poses are interpolated between them. */
export type Motion = Pose[];

function lerpHand(a: HandPose | null | undefined, b: HandPose | null | undefined, t: number): HandPose | null {
  if (!a || !b) return (t < 0.5 ? a : b) ?? null;
  const mix = (p: number, q: number) => p + (q - p) * t;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    curl: a.curl.map((c, i) => mix(c, b.curl[i]!)) as HandPose['curl'],
    angle: mix(a.angle ?? -Math.PI / 2, b.angle ?? -Math.PI / 2),
    size: mix(a.size ?? 0.4, b.size ?? 0.4),
    mirrored: a.mirrored,
  };
}

export function poseAt(motion: Motion, t: number): Pose {
  if (motion.length === 1) return motion[0]!;
  const pos = Math.min(Math.max(t, 0), 1) * (motion.length - 1);
  const i = Math.min(Math.floor(pos), motion.length - 2);
  const local = pos - i;
  return { left: lerpHand(motion[i]!.left, motion[i + 1]!.left, local), right: lerpHand(motion[i]!.right, motion[i + 1]!.right, local) };
}

export interface PerformOptions {
  durationMs?: number;
  fps?: number;
  noise?: number;
  seed?: number;
  startMs?: number;
  /** Rest frames (person visible, hands down) before and after. */
  restBeforeMs?: number;
  restAfterMs?: number;
  /** Swap hands and flip x, like a left-handed signer. */
  mirror?: boolean;
  /** Shift of the whole movement (shoulder widths). */
  offset?: { x: number; y: number };
}

function mirrorHand(hand: HandPose | null | undefined): HandPose | null {
  if (!hand) return null;
  return { ...hand, x: -hand.x, mirrored: !hand.mirrored };
}

/** Frames of a person performing `motion`, as the camera engine would deliver them. */
export function perform(motion: Motion, options: PerformOptions = {}): LandmarkFrame[] {
  const { durationMs = 1200, fps = 15, noise = 0.01, seed = 1, startMs = 0, restBeforeMs = 0, restAfterMs = 0 } = options;
  const random = rng(seed);
  const frames: LandmarkFrame[] = [];
  const step = 1000 / fps;
  let t = startMs;
  const push = (pose: Pose) => {
    frames.push({ timestampMs: Math.round(t), values: frameFor(pose, noise, random) });
    t += step;
  };
  for (let r = 0; r < restBeforeMs; r += step) push({});
  const count = Math.max(2, Math.round(durationMs / step));
  for (let i = 0; i < count; i++) {
    let pose = poseAt(motion, i / (count - 1));
    if (options.offset) {
      const shift = (h: HandPose | null | undefined) => (h ? { ...h, x: h.x + options.offset!.x, y: h.y + options.offset!.y } : h);
      pose = { left: shift(pose.left), right: shift(pose.right) };
    }
    if (options.mirror) pose = { left: mirrorHand(pose.right), right: mirrorHand(pose.left) };
    push(pose);
  }
  for (let r = 0; r < restAfterMs; r += step) push({});
  return frames;
}

const OPEN: HandPose['curl'] = [0, 0, 0, 0, 0];
const FIST: HandPose['curl'] = [0.8, 1, 1, 1, 1];
const POINT: HandPose['curl'] = [0.8, 0, 1, 1, 1];
const TWO: HandPose['curl'] = [0.8, 0, 0, 1, 1];

/** Distinct test movements. */
export const MOTIONS: Record<string, Motion> = {
  wave: [
    { right: { x: -0.7, y: -0.3, curl: OPEN } },
    { right: { x: -0.4, y: -0.35, curl: OPEN } },
    { right: { x: -0.7, y: -0.3, curl: OPEN } },
    { right: { x: -0.4, y: -0.35, curl: OPEN } },
  ],
  knock: [
    { right: { x: -0.2, y: 0.3, curl: FIST, angle: 0 } },
    { right: { x: -0.1, y: 0.1, curl: FIST, angle: 0 } },
    { right: { x: -0.2, y: 0.3, curl: FIST, angle: 0 } },
    { right: { x: -0.1, y: 0.1, curl: FIST, angle: 0 } },
  ],
  point_arc: [
    { right: { x: -0.6, y: 0.2, curl: POINT } },
    { right: { x: -0.3, y: -0.2, curl: POINT } },
    { right: { x: 0.1, y: 0.1, curl: POINT } },
  ],
  two_hands: [
    { right: { x: -0.4, y: 0.2, curl: TWO }, left: { x: 0.4, y: 0.2, curl: TWO } },
    { right: { x: -0.2, y: 0.25, curl: TWO }, left: { x: 0.2, y: 0.25, curl: TWO } },
  ],
  // Held handshapes, like fingerspelled letters.
  hold_fist: [{ right: { x: -0.3, y: 0.2, curl: FIST } }],
  hold_two: [{ right: { x: -0.3, y: 0.2, curl: TWO } }],
  hold_open: [{ right: { x: -0.3, y: 0.2, curl: OPEN } }],
  // Something no sign was taught for.
  scratch: [
    { right: { x: 0.1, y: -0.9, curl: [0.3, 0.5, 0.5, 0.5, 0.5], angle: 0.5 } },
    { right: { x: 0.2, y: -0.85, curl: [0.3, 0.5, 0.5, 0.5, 0.5], angle: 0.5 } },
    { right: { x: 0.1, y: -0.9, curl: [0.3, 0.5, 0.5, 0.5, 0.5], angle: 0.5 } },
  ],
};
