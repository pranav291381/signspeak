import {
  FRAME_DIM,
  LEFT_HAND_PRESENT_INDEX,
  POSE_PRESENT_INDEX,
  RIGHT_HAND_PRESENT_INDEX,
  RIGHT_HAND_START,
} from '@/recognition/featureSpec';
import { frameFor, MOTIONS, perform } from '@/test-utils/landmarks';

import { cleanRecording, fillGaps, signingSpan, smoothFrames, trimToSigning } from '../clean';

const arc = () => perform(MOTIONS.point_arc!, { durationMs: 1400, noise: 0 }).map((f) => f.values!);

function dropRightHand(frames: Float32Array[], indices: number[]): Float32Array[] {
  return frames.map((frame, i) => {
    if (!indices.includes(i)) return frame;
    const out = Float32Array.from(frame);
    out.fill(0, RIGHT_HAND_START, RIGHT_HAND_START + 63);
    out[RIGHT_HAND_PRESENT_INDEX] = 0;
    return out;
  });
}

const point = (frame: Float32Array, k: number): [number, number] => [frame[RIGHT_HAND_START + k * 3]!, frame[RIGHT_HAND_START + k * 3 + 1]!];

describe('fillGaps', () => {
  it('puts a lost hand where the pose tracker saw its wrist, with the shape blended across the gap', () => {
    const original = arc();
    const filled = fillGaps(dropRightHand(original, [8, 9, 10]));
    for (const i of [8, 9, 10]) {
      expect(filled[i]![RIGHT_HAND_PRESENT_INDEX]).toBe(1);
      // The synthetic pose wrist is the hand's wrist: the hand lands where it really was.
      const [wx, wy] = point(filled[i]!, 0);
      expect(wx).toBeCloseTo(point(original[i]!, 0)[0]!, 5);
      expect(wy).toBeCloseTo(point(original[i]!, 0)[1]!, 5);
      // The fingertip follows closely (the arc turns slowly).
      const [tx, ty] = point(filled[i]!, 8);
      expect(Math.hypot(tx - point(original[i]!, 8)[0]!, ty - point(original[i]!, 8)[1]!)).toBeLessThan(0.05);
    }
    // Seen frames are untouched, and a hand that was never there stays absent.
    expect(Array.from(filled[3]!)).toEqual(Array.from(original[3]!));
    expect(filled[9]![LEFT_HAND_PRESENT_INDEX]).toBe(0);
  });

  it('fills a lost frame from the frames either side', () => {
    const original = arc();
    const withHole: (Float32Array | null)[] = [...original];
    withHole[6] = null;
    const filled = fillGaps(withHole);
    expect(filled[6]![POSE_PRESENT_INDEX]).toBe(1);
    expect(filled[6]![RIGHT_HAND_PRESENT_INDEX]).toBe(1);
    expect(filled[6]).toHaveLength(FRAME_DIM);
  });

  it('does not bridge long gaps, only carries the hand a few frames past where it was seen', () => {
    const original = arc();
    const gap = Array.from({ length: 14 }, (_, k) => k + 3);
    const filled = fillGaps(dropRightHand(original, gap), { maxGap: 10, maxEdge: 2 });
    const present = filled.map((f) => f[RIGHT_HAND_PRESENT_INDEX]);
    expect(present.slice(3, 5)).toEqual([1, 1]);
    expect(present.slice(5, 15)).toEqual(Array(10).fill(0));
    expect(present.slice(15, 17)).toEqual([1, 1]);
  });

  it('adds nothing where no body was seen either', () => {
    const filled = fillGaps([null, null, frameFor({ right: { x: -0.3, y: 0.2, curl: [0, 0, 0, 0, 0] } })]);
    expect(filled[0]![POSE_PRESENT_INDEX]).toBe(0);
    expect(filled[0]![RIGHT_HAND_PRESENT_INDEX]).toBe(0);
  });
});

describe('smoothFrames', () => {
  it('evens out tracking jitter and leaves absent hands alone', () => {
    const shaky = perform(MOTIONS.hold_open!, { durationMs: 2000, noise: 0.03, seed: 3 }).map((f) => f.values!);
    const spread = (frames: Float32Array[]) => {
      const xs = frames.map((f) => point(f, 8)[0]!);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    };
    const smooth = smoothFrames(shaky);
    expect(spread(smooth)).toBeLessThan(spread(shaky) * 0.8);
    expect(smooth.every((f) => f[LEFT_HAND_PRESENT_INDEX] === 0)).toBe(true);
  });
});

describe('trimming', () => {
  it('keeps the signing and a margin of rest either side', () => {
    const frames = perform(MOTIONS.wave!, { durationMs: 1000, restBeforeMs: 1000, restAfterMs: 1000 }).map((f) => f.values!);
    const span = signingSpan(frames)!;
    // About a second of rest (15 frames) comes first.
    expect(span[0]).toBeGreaterThanOrEqual(15);
    const trimmed = trimToSigning(frames, 3);
    expect(trimmed).toHaveLength(span[1] - span[0] + 1 + 6);
    expect(trimmed[0]).toBe(frames[span[0] - 3]);
    expect(signingSpan([null, null])).toBeNull();
    expect(trimToSigning([null], 2)).toEqual([null]);
  });

  it('cleans a whole recording', () => {
    const frames = perform(MOTIONS.wave!, { durationMs: 1000, restBeforeMs: 1000, restAfterMs: 1000 }).map((f) => f.values!);
    const cleaned = cleanRecording(dropRightHand(frames, [20, 21]), 4);
    expect(cleaned.length).toBeLessThan(frames.length);
    expect(cleaned.slice(4, -4).every((f) => f[RIGHT_HAND_PRESENT_INDEX] === 1)).toBe(true);
  });
});
