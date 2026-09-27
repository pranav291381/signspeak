import {
  FRAME_DIM,
  LEFT_HAND_PRESENT_INDEX,
  LEFT_HAND_START,
  RIGHT_HAND_PRESENT_INDEX,
  RIGHT_HAND_START,
} from '@/recognition/featureSpec';
import { createMemoryStore } from '@/storage/keyValueStore';

import { base64ToBytes, bytesToBase64, decodeFrames, encodeFrames } from '../codec';
import { compactFrame, frameDistance } from '../compact';
import { subsequenceDtw } from '../dtw';
import { compactSequence } from '../matcher';
import { prepareSample, resampleByTime, SAMPLE_FPS } from '../sample';
import {
  deleteAllSigns,
  deleteSign,
  loadSigns,
  sanitizeSign,
  saveSign,
  SIGN_KEY_PREFIX,
  SIGNS_INDEX_KEY,
  signIdFor,
  withSample,
} from '../store';
import { MAX_SAMPLES } from '../types';

import { frameFor, MOTIONS, perform, type HandPose } from '@/test-utils/landmarks';

const valuesOf = (frames: ReturnType<typeof perform>) => frames.map((f) => f.values!);

describe('codec', () => {
  it('matches the RFC 4648 test vectors and round-trips any bytes', () => {
    const vectors: [string, string][] = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [text, encoded] of vectors) {
      expect(bytesToBase64(Uint8Array.from(text, (c) => c.charCodeAt(0)))).toBe(encoded);
    }
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => (i * 97 + 13) & 255);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    expect(() => base64ToBytes('ab$d')).toThrow();
    expect(() => base64ToBytes('abc')).toThrow();
  });

  it('round-trips frames to 1/1000 and clamps what Int16 cannot hold', () => {
    const frames = [Float32Array.from([0.12345, -1.5, 40, Number.NaN]), Float32Array.from([0, 1, -40, 2.0004])];
    const decoded = decodeFrames(encodeFrames(frames, 4), 2, 4);
    expect(Array.from(decoded[0]!)).toEqual([0.123, -1.5, 32.767, 0].map((x) => Math.fround(x)));
    expect(decoded[1]![3]).toBeCloseTo(2, 3);
    expect(() => decodeFrames(encodeFrames(frames, 4), 3, 4)).toThrow();
    expect(() => encodeFrames([new Float32Array(3)], 4)).toThrow();
  });
});

describe('prepareSample', () => {
  it('trims to the part with hands and resamples to a fixed rate', () => {
    const recorded = perform(MOTIONS.wave!, { durationMs: 1000, fps: 30, restBeforeMs: 500, restAfterMs: 500 });
    const result = prepareSample(recorded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // ~1 s of signing at 15 fps, the resting frames removed.
    expect(result.frames.length).toBeGreaterThanOrEqual(SAMPLE_FPS - 1);
    expect(result.frames.length).toBeLessThanOrEqual(SAMPLE_FPS + 2);
    expect(result.frames.every((f) => f.length === FRAME_DIM)).toBe(true);
  });

  it('explains why a recording cannot be used', () => {
    expect(prepareSample([])).toEqual({ ok: false, problem: 'no_signer' });
    expect(prepareSample(perform([{}], { durationMs: 2000 }))).toEqual({ ok: false, problem: 'no_hands' });
    expect(prepareSample(perform(MOTIONS.wave!, { durationMs: 200, restBeforeMs: 1000 }))).toEqual({
      ok: false,
      problem: 'too_short',
    });
  });

  it('marks long tracking gaps as missing', () => {
    const frames = [
      { timestampMs: 0, values: new Float32Array(FRAME_DIM) },
      { timestampMs: 1000, values: new Float32Array(FRAME_DIM) },
    ];
    const out = resampleByTime(frames, 0, 1000);
    expect(out[0]).not.toBeNull();
    expect(out[7]).toBeNull();
    expect(out.at(-1)).not.toBeNull();
  });
});

describe('compact frames', () => {
  const hand: HandPose = { x: -0.3, y: 0.2, curl: [0.8, 0, 0, 1, 1] };

  it('describes handshape independently of hand size', () => {
    const near = compactFrame(frameFor({ right: { ...hand, size: 0.5 } }));
    const far = compactFrame(frameFor({ right: { ...hand, size: 0.3 } }));
    // Only the elbows and wrist are shared; handshape coordinates are identical.
    expect(frameDistance(near, far)).toBeLessThan(1e-4);
  });

  it('mirrors a left-handed signer onto the right hand', () => {
    const right = compactFrame(frameFor({ right: hand }));
    const left = compactFrame(frameFor({ left: { ...hand, x: -hand.x, mirrored: true } }), true);
    expect(frameDistance(right, left)).toBeLessThan(0.05);
  });

  it('does not depend on which hand label MediaPipe used', () => {
    const correct = frameFor({ right: hand });
    // The same frame with the hand stored in the "left" slot (a label flip).
    const flipped = Float32Array.from(correct);
    flipped.copyWithin(LEFT_HAND_START, RIGHT_HAND_START, RIGHT_HAND_START + 63);
    flipped.fill(0, RIGHT_HAND_START, RIGHT_HAND_START + 63);
    flipped[LEFT_HAND_PRESENT_INDEX] = 1;
    flipped[RIGHT_HAND_PRESENT_INDEX] = 0;
    expect(frameDistance(compactFrame(correct), compactFrame(flipped))).toBeLessThan(1e-6);

    // Two hands still have to match hand for hand.
    const two = frameFor({ right: hand, left: { ...hand, x: 0.35, curl: [0.8, 1, 1, 1, 1], mirrored: true } });
    const twoOpen = frameFor({ right: hand, left: { ...hand, x: 0.35, curl: [0, 0, 0, 0, 0], mirrored: true } });
    expect(frameDistance(compactFrame(two), compactFrame(twoOpen))).toBeGreaterThan(1);
  });

  it('tells different handshapes apart', () => {
    const two = compactFrame(frameFor({ right: hand }));
    const fist = compactFrame(frameFor({ right: { ...hand, curl: [0.8, 1, 1, 1, 1] } }));
    expect(frameDistance(two, fist)).toBeGreaterThan(1);
  });
});

describe('subsequenceDtw', () => {
  const sign = compactSequence(valuesOf(perform(MOTIONS.point_arc!, { noise: 0 })));

  it('is zero for identical sequences and infinite for empty ones', () => {
    expect(subsequenceDtw(sign, sign)).toBeCloseTo(0, 6);
    expect(subsequenceDtw([], sign)).toBe(Infinity);
  });

  it('tolerates signing slower, and finds the sign inside a longer stretch', () => {
    const slow = compactSequence(valuesOf(perform(MOTIONS.point_arc!, { noise: 0, durationMs: 2000 })));
    const embedded = compactSequence(
      valuesOf(perform(MOTIONS.point_arc!, { noise: 0, restBeforeMs: 1000, restAfterMs: 1000 })),
    );
    const other = compactSequence(valuesOf(perform(MOTIONS.knock!, { noise: 0 })));
    expect(subsequenceDtw(sign, slow)).toBeLessThan(0.1);
    expect(subsequenceDtw(sign, embedded)).toBeLessThan(0.05);
    expect(subsequenceDtw(sign, other)).toBeGreaterThan(1);
  });
});

describe('store', () => {
  const frames = valuesOf(perform(MOTIONS.wave!, { durationMs: 600 }));

  it('derives stable IDs so re-teaching adds to the same sign', () => {
    expect(signIdFor({ kind: 'library', signId: 'hello' })).toBe('library:hello');
    expect(signIdFor({ kind: 'letter', letter: 'B' })).toBe('letter:b');
    expect(signIdFor({ kind: 'custom', text: '  Good   Night! ', language: 'en' })).toBe('custom:good night');
  });

  it('keeps at most MAX_SAMPLES recordings', () => {
    const target = { kind: 'letter', letter: 'a' } as const;
    let sign = withSample(undefined, target, frames);
    for (let i = 0; i < MAX_SAMPLES + 2; i++) sign = withSample(sign, target, frames);
    expect(sign.samples).toHaveLength(MAX_SAMPLES);
    expect(sign.id).toBe('letter:a');
  });

  it('saves, loads and deletes signs one key per sign', async () => {
    const store = createMemoryStore();
    const a = withSample(undefined, { kind: 'library', signId: 'hello' }, frames);
    const b = withSample(undefined, { kind: 'custom', text: 'Chai', language: 'en' }, frames);
    await saveSign(store, a, []);
    await saveSign(store, b, [a.id]);
    expect(JSON.parse(store.data.get(SIGNS_INDEX_KEY)!)).toEqual([a.id, b.id]);
    expect(store.data.has(SIGN_KEY_PREFIX + b.id)).toBe(true);

    const loaded = await loadSigns(store);
    expect(loaded.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(loaded[0]!.samples[0]!.data).toBe(a.samples[0]!.data);

    await deleteSign(store, a.id, [a.id, b.id]);
    expect((await loadSigns(store)).map((s) => s.id)).toEqual([b.id]);
    await deleteAllSigns(store, [b.id]);
    expect(store.data.size).toBe(0);
  });

  it('drops damaged data instead of failing', async () => {
    const good = withSample(undefined, { kind: 'letter', letter: 'c' }, frames);
    const store = createMemoryStore({
      [SIGNS_INDEX_KEY]: JSON.stringify(['letter:c', 'letter:x', 'bad']),
      [SIGN_KEY_PREFIX + 'letter:c']: JSON.stringify({
        ...good,
        samples: [...good.samples, { frames: 3, dim: FRAME_DIM, data: 'AAAA' }],
      }),
      [SIGN_KEY_PREFIX + 'bad']: '{not json',
    });
    const loaded = await loadSigns(store);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.samples).toHaveLength(1);
    expect(sanitizeSign({ ...good, target: { kind: 'letter', letter: 'ä' } })).toBeNull();
    expect(sanitizeSign({ ...good, featureSpecVersion: 2 })).toBeNull();
  });
});
