import { FRAME_DIM, LEFT_HAND_PRESENT_INDEX, POSE_PRESENT_INDEX, RIGHT_HAND_PRESENT_INDEX } from '../featureSpec';
import { blendFrames, FrameResampler } from '../resample';

/** A frame whose coordinates are all `value`, with the given parts present. */
const frame = (value: number, { left = true, right = true } = {}) => {
  const v = new Float32Array(FRAME_DIM).fill(value);
  v[POSE_PRESENT_INDEX] = 1;
  v[LEFT_HAND_PRESENT_INDEX] = left ? 1 : 0;
  v[RIGHT_HAND_PRESENT_INDEX] = right ? 1 : 0;
  if (!left) v.fill(0, 27, 90);
  if (!right) v.fill(0, 90, 153);
  return v;
};

describe('FrameResampler', () => {
  it('passes frames through when they already arrive at 15 a second', () => {
    const r = new FrameResampler();
    const times = [0, 67, 133, 200, 267];
    const out = times.flatMap((t) => r.push({ timestampMs: t, values: frame(t) }));
    expect(out.map((f) => f.timestampMs)).toEqual(times);
  });

  it('fills a slow phone’s gaps so the model still sees 15 frames a second', () => {
    const r = new FrameResampler();
    r.push({ timestampMs: 0, values: frame(0) });
    // 3 tracked frames a second: one every 333 ms, i.e. 5 slots.
    const out = r.push({ timestampMs: 333, values: frame(1) });
    expect(out).toHaveLength(5);
    expect(out.map((f) => Math.round(f.timestampMs))).toEqual([67, 133, 200, 266, 333]);
    // Interpolated positions, the last one the tracked frame itself.
    expect(Array.from(out, (f) => Number(f.values![5]!.toFixed(2)))).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('does not fill long gaps (paused, app in the background)', () => {
    const r = new FrameResampler();
    r.push({ timestampMs: 0, values: frame(0) });
    expect(r.push({ timestampMs: 5000, values: frame(1) })).toHaveLength(1);
    r.reset();
    expect(r.push({ timestampMs: 5100, values: frame(1) })).toHaveLength(1);
  });
});

describe('blendFrames', () => {
  it('interpolates parts present in both frames and takes the nearer frame otherwise', () => {
    const a = frame(0);
    const b = frame(1, { right: false });
    const mid = blendFrames(a, b, 0.25)!;
    expect(mid[0]).toBeCloseTo(0.25); // pose: in both
    expect(mid[30]).toBeCloseTo(0.25); // left hand: in both
    expect(mid[100]).toBe(0); // right hand: only in a, the nearer frame (w < 0.5)
    expect(mid[RIGHT_HAND_PRESENT_INDEX]).toBe(1);
    const late = blendFrames(a, b, 0.75)!;
    expect(late[RIGHT_HAND_PRESENT_INDEX]).toBe(0);
    expect(late[100]).toBe(0);
  });

  it('keeps nobody-in-view frames as they are', () => {
    expect(blendFrames(null, frame(1), 0.2)).toBeNull();
    expect(blendFrames(null, frame(1), 0.8)![0]).toBe(1);
  });
});
