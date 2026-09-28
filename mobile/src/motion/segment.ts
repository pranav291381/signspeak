import { POSE_LEFT_WRIST_Y, POSE_RIGHT_WRIST_Y } from '@/recognition/features';
import { POSE_PRESENT_INDEX } from '@/recognition/featureSpec';

import { signingSpan } from './clean';

/**
 * Where the sign is in a recording.
 *
 * - `start`–`end`: a hand or wrist is raised (from the first raise to the last).
 * - `coreStart`–`coreEnd`: the sign itself, without the arm rising from rest at
 *   the start and dropping back at the end. Signs in a sentence are joined
 *   core to core, as signers do, instead of returning to rest between them.
 */
export interface SignSpan {
  start: number;
  end: number;
  coreStart: number;
  coreEnd: number;
}

/** Wrist speed (shoulder widths per frame at 15 fps) below which the arm has arrived. */
const SETTLED_SPEED = 0.12;
/** The rise and drop never take more than this share of the raised part each. */
const MAX_TRIM_SHARE = 0.35;

function wristSpeed(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if ((a[POSE_PRESENT_INDEX] ?? 0) < 0.5 || (b[POSE_PRESENT_INDEX] ?? 0) < 0.5) return 0;
  const moved = (y: number) => Math.hypot(b[y - 1]! - a[y - 1]!, b[y]! - a[y]!);
  return Math.max(moved(POSE_LEFT_WRIST_Y), moved(POSE_RIGHT_WRIST_Y));
}

export function signSpan(frames: readonly ArrayLike<number>[]): SignSpan | null {
  const span = signingSpan(frames);
  if (!span) return null;
  const [start, end] = span;
  const limit = Math.floor((end - start + 1) * MAX_TRIM_SHARE);
  const speed = (t: number) => (t <= 0 || t >= frames.length ? 0 : wristSpeed(frames[t - 1]!, frames[t]!));

  // Rising: keep going while the arm still moves fast into the next frame.
  let coreStart = start;
  while (coreStart < start + limit && speed(coreStart + 1) >= SETTLED_SPEED) coreStart++;
  // Dropping: step back while the arm was already moving fast into this frame.
  let coreEnd = end;
  while (coreEnd > end - limit && coreEnd > coreStart && speed(coreEnd) >= SETTLED_SPEED) coreEnd--;
  return { start, end, coreStart, coreEnd };
}
