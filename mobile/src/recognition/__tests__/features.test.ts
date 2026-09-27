import fixture from '../../../../shared/fixtures/feature_parity_v1.json';
import { handsRaised, handsVisible, normalizeFrame, POSE_LEFT_WRIST_Y, POSE_RIGHT_WRIST_Y, signerPresent, signing, type Point3 } from '../features';
import { FRAME_DIM, LEFT_HAND_PRESENT_INDEX, POSE_PRESENT_INDEX, RIGHT_HAND_PRESENT_INDEX } from '../featureSpec';

type RawPoint = { x: number | null; y: number | null; z: number | null };

/** The fixture stores NaN as null (JSON has no NaN). */
function points(raw: RawPoint[] | null): Point3[] | null {
  return raw ? raw.map((p) => ({ x: p.x ?? Number.NaN, y: p.y ?? Number.NaN, z: p.z ?? Number.NaN })) : null;
}

describe('normalizeFrame parity with the Python training code', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const actual = normalizeFrame(points(c.pose as RawPoint[] | null), points(c.left as RawPoint[] | null), points(c.right as RawPoint[] | null));
    expect(actual).toHaveLength(FRAME_DIM);
    c.expected.forEach((value, i) => {
      if (Math.abs((actual[i] ?? 0) - value) > 1e-5) {
        throw new Error(`index ${i}: expected ${value}, got ${actual[i]}`);
      }
    });
  });
});

describe('frame helpers', () => {
  const both = fixture.cases.find((c) => c.name === 'both hands')!;
  const noHands = fixture.cases.find((c) => c.name === 'no hands')!;
  const frame = (c: typeof both) => Float32Array.from(c.expected);

  it('detects a signer and visible hands', () => {
    expect(signerPresent(frame(both))).toBe(true);
    expect(handsVisible(frame(both))).toBe(true);
    expect(signerPresent(frame(noHands))).toBe(true);
    expect(handsVisible(frame(noHands))).toBe(false);
  });

  it('treats missing or wrongly sized frames as nobody in view', () => {
    expect(signerPresent(null)).toBe(false);
    expect(handsVisible(new Float32Array([1]))).toBe(false);
  });
});

describe('signing', () => {
  // Arms hanging down: wrists 1.6 shoulder widths below the shoulders, no hands tracked.
  const resting = () => {
    const f = new Float32Array(FRAME_DIM);
    f[POSE_PRESENT_INDEX] = 1;
    f[POSE_LEFT_WRIST_Y] = 1.6;
    f[POSE_RIGHT_WRIST_Y] = 1.6;
    return f;
  };

  it('reads the pose wrists where the feature spec puts them', () => {
    // Pose order: nose, shoulders, elbows, wrists, hips; x, y, z each.
    expect(POSE_LEFT_WRIST_Y).toBe(16);
    expect(POSE_RIGHT_WRIST_Y).toBe(19);
  });

  it('counts a raised wrist even when the hand tracker lost the hand (motion blur)', () => {
    const f = resting();
    f[POSE_RIGHT_WRIST_Y] = 0.4;
    expect(handsRaised(f)).toBe(false);
    expect(signing(f)).toBe(true);
  });

  it('is not signing with arms down, nobody in view, or a wrong frame', () => {
    expect(signing(resting())).toBe(false);
    const nobody = resting();
    nobody[POSE_RIGHT_WRIST_Y] = 0.4;
    nobody[POSE_PRESENT_INDEX] = 0;
    expect(signing(nobody)).toBe(false);
    expect(signing(null)).toBe(false);
    expect(signing(new Float32Array(3))).toBe(false);
  });

  it('counts a raised tracked hand', () => {
    const f = resting();
    f[RIGHT_HAND_PRESENT_INDEX] = 1;
    f[91] = 0.2; // right hand wrist y
    expect(signing(f)).toBe(true);
    f[LEFT_HAND_PRESENT_INDEX] = 0;
    expect(handsRaised(f)).toBe(true);
  });
});
