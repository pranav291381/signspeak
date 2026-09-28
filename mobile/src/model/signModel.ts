import { toXY, XY_FRAME_DIM } from '@/personal/codec';

import type { MemberFeatures, ModelPack } from './modelPack';
import { TemporalModel } from './temporalModel';
import { TransformerModel } from './transformerModel';

/** The 51 points of an x/y frame (see toXY): pose 0–8, left hand 9–29, right hand 30–50; then 3 presence flags. */
const POINTS = 51;
const LEFT_HAND = 9;
const RIGHT_HAND = 30;
const HAND_POINTS = 21;
const FLAGS = POINTS * 2;

/**
 * A sequence resampled to `length` frames by linear interpolation between the
 * nearest frames, as `resample` in ml/scripts/train_segments.py.
 */
export function resampleFrames(frames: readonly ArrayLike<number>[], length: number): Float32Array[] {
  const count = frames.length;
  const dim = frames[0]?.length ?? 0;
  return Array.from({ length }, (_, k) => {
    const position = length === 1 || count === 1 ? 0 : (k * (count - 1)) / (length - 1);
    const i0 = Math.floor(position);
    const i1 = Math.min(i0 + 1, count - 1);
    const w = position - i0;
    const a = frames[i0]!;
    const b = frames[i1]!;
    const out = new Float32Array(dim);
    for (let i = 0; i < dim; i++) out[i] = a[i]! * (1 - w) + b[i]! * w;
    return out;
  });
}

/**
 * A member's per-frame input, as `member_input` in train_segments.py.
 * `xy`: the x/y frame itself (105). `xy+hands+vel`: also each hand's shape
 * (points relative to its wrist, in wrist-to-middle-knuckle lengths; 84) and
 * how every point moved since the previous frame (102). The presence flags
 * stay last: the network reads the third-to-last value as "a person is in view".
 */
export function memberInput(frames: readonly Float32Array[], features: MemberFeatures): Float32Array[] {
  if (features === 'xy') return [...frames];
  const extra = 2 * HAND_POINTS * 2 + POINTS * 2;
  return frames.map((frame, t) => {
    const out = new Float32Array(XY_FRAME_DIM + extra);
    out.set(frame.subarray(0, FLAGS));
    let k = FLAGS;
    for (const [start, flag] of [
      [LEFT_HAND, FLAGS + 1],
      [RIGHT_HAND, FLAGS + 2],
    ] as const) {
      const shown = frame[flag]! > 0.5;
      const wx = frame[start * 2]!;
      const wy = frame[start * 2 + 1]!;
      const size = Math.max(Math.hypot(frame[(start + 9) * 2]! - wx, frame[(start + 9) * 2 + 1]! - wy), 1e-3);
      for (let p = 0; p < HAND_POINTS; p++) {
        out[k++] = shown ? (frame[(start + p) * 2]! - wx) / size : 0;
        out[k++] = shown ? (frame[(start + p) * 2 + 1]! - wy) / size : 0;
      }
    }
    const previous = frames[Math.max(0, t - 1)]!;
    for (let i = 0; i < POINTS * 2; i++) out[k++] = frame[i]! - previous[i]!;
    out.set(frame.subarray(FLAGS, FLAGS + 3), k);
    return out;
  });
}

/**
 * The networks of a model pack. A window pack has one, reading the last
 * frames; a segment pack reads a whole sign, resampled to its frame count,
 * and averages the logits of all its members.
 */
export class SignModel {
  private readonly members: { model: TemporalModel | TransformerModel; features: MemberFeatures }[];

  constructor(private readonly pack: ModelPack) {
    this.members = pack.members.map((member) => ({
      model: member.architecture === 'segment-transformer-v1' ? new TransformerModel(member) : new TemporalModel(member),
      features: member.features,
    }));
  }

  /** Logits for spec-v1 frames (depth zeroed): a window, or a whole sign for segment packs. */
  forward(frames: readonly ArrayLike<number>[]): Float64Array {
    if (this.pack.mode === 'window') return this.members[0]!.model.forward(frames);
    const sign = frames.map(toXY);
    const total = new Float64Array(this.pack.labels.length);
    for (const { model, features } of this.members) {
      const logits = model.forward(resampleFrames(memberInput(sign, features), this.pack.windowFrames));
      for (let i = 0; i < total.length; i++) total[i] = total[i]! + logits[i]! / this.members.length;
    }
    return total;
  }
}
