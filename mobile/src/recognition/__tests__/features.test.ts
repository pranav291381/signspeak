import fixture from '../../../../shared/fixtures/feature_parity_v1.json';
import { handsVisible, normalizeFrame, signerPresent, type Point3 } from '../features';
import { FRAME_DIM } from '../featureSpec';

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
