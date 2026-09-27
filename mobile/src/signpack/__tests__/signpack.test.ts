import { decodeSpecFrames, encodeFrames, fromXY, toXY, XY_FRAME_DIM } from '@/personal/codec';
import { FRAME_DIM } from '@/recognition/featureSpec';
import { testPack } from '@/test-utils/packs';

import { loadBundledPacks } from '../loader';
import { packReferences, parseSignPack, SignPackError } from '../parse';
import { buildVocabulary } from '../vocabulary';

const pack = testPack([
  { text: 'Hello', motion: 'wave' },
  { text: 'Water', motion: 'knock' },
  { text: 'A', motion: 'hold_fist', letter: true },
]);
const clone = () => JSON.parse(JSON.stringify(pack));

describe('parseSignPack', () => {
  it('accepts a pack made by the builder', () => {
    const { pack: parsed, skipped } = parseSignPack(clone());
    expect(skipped).toBe(0);
    expect(parsed).toEqual(pack);
  });

  it.each([
    ['another format', { format: 'something-else' }, 'Not a sign pack'],
    ['a newer version', { version: 2 }, 'Unsupported sign pack version 2'],
    ['other landmark features', { featureSpecVersion: 2 }, 'other landmark features'],
    ['another frame rate', { sampleFps: 30 }, 'another frame rate'],
    ['an unusable id', { id: 'Has Spaces' }, 'header is incomplete'],
    ['no permission statement', { source: { name: 'x', url: 'https://x.org' } }, 'where its signs come from'],
    ['no sign list', { signs: 'hello' }, 'has no signs'],
  ])('rejects a pack with %s', (_, change, message) => {
    expect(() => parseSignPack({ ...clone(), ...change })).toThrow(SignPackError);
    expect(() => parseSignPack({ ...clone(), ...change })).toThrow(message);
  });

  it('leaves out broken signs and keeps the rest', () => {
    const raw = clone();
    const good = raw.signs[0];
    raw.signs.push(
      { ...good, id: 'other-pack:hello' }, // id of another pack
      { ...good, id: 'test:x', text: '  ' }, // no meaning
      { ...good, id: 'test:y', language: 'xx' }, // unknown language
      { ...good, id: 'test:z', samples: [{ frames: 3, dim: FRAME_DIM, data: 'AAAA' }] }, // data does not match its size
      { ...good, id: 'test:w', samples: [{ ...good.samples[0], dim: 10 }] }, // other features
      { ...good }, // duplicate id
      null,
    );
    const { pack: parsed, skipped } = parseSignPack(raw);
    expect(parsed.signs.map((s) => s.id)).toEqual(['test:hello', 'test:water', 'test:a']);
    expect(skipped).toBe(7);
  });

  it('keeps optional details only when they are valid', () => {
    const raw = clone();
    Object.assign(raw.signs[0], { category: 'Greetings', sourceUrl: 'https://example.org/hello', threshold: 0.7 });
    Object.assign(raw.signs[1], { sourceUrl: 'javascript:alert(1)', threshold: 99 });
    raw.defaultThreshold = -1;
    const { pack: parsed } = parseSignPack(raw);
    expect(parsed.signs[0]).toMatchObject({ category: 'Greetings', sourceUrl: 'https://example.org/hello', threshold: 0.7 });
    expect(parsed.signs[1]).not.toHaveProperty('sourceUrl');
    expect(parsed.signs[1]).not.toHaveProperty('threshold');
    expect(parsed).not.toHaveProperty('defaultThreshold');
  });

  it('accepts full frames as well as frames without depth', () => {
    const raw = clone();
    expect(raw.signs[0].samples[0].dim).toBe(XY_FRAME_DIM);
    const frames = [new Float32Array(FRAME_DIM).fill(0.25)];
    raw.signs[1].samples = [{ frames: 1, dim: FRAME_DIM, data: encodeFrames(frames, FRAME_DIM) }];
    expect(parseSignPack(raw).pack.signs).toHaveLength(3);
  });

  it('accepts a sample of any length whose data matches it', () => {
    const raw = clone();
    const frames = [new Float32Array(FRAME_DIM).fill(0.5)];
    raw.signs[0].samples = [{ frames: 1, dim: FRAME_DIM, data: encodeFrames(frames, FRAME_DIM) }];
    expect(parseSignPack(raw).pack.signs[0]!.samples[0]!.frames).toBe(1);
  });
});

describe('frames without depth', () => {
  it('keep every x, y and presence flag, and only drop depth', () => {
    const frame = Float32Array.from({ length: FRAME_DIM }, (_, i) => (i % 7) / 10 - 0.3);
    const back = fromXY(toXY(frame));
    frame.forEach((v, i) => {
      const isDepth = i < 153 && i % 3 === 2;
      expect(back[i]).toBeCloseTo(isDepth ? 0 : v, 6);
    });
    expect(XY_FRAME_DIM).toBe(105);
  });

  it('decode as full frames, and an unknown layout is refused', () => {
    const frame = Float32Array.from({ length: FRAME_DIM }, (_, i) => i / 1000);
    const [decoded] = decodeSpecFrames(encodeFrames([toXY(frame)], XY_FRAME_DIM), 1, XY_FRAME_DIM);
    expect(decoded).toHaveLength(FRAME_DIM);
    expect(() => decodeSpecFrames(encodeFrames([new Float32Array(10)], 10), 1, 10)).toThrow('Unknown frame layout');
  });
});

describe('packReferences', () => {
  it('gives each sign its own acceptance distance, or the pack default', () => {
    const raw = clone();
    raw.signs[0].threshold = 0.6;
    const references = packReferences(parseSignPack(raw).pack);
    expect(references.map((r) => [r.id, r.letter, r.threshold])).toEqual([
      ['test:hello', false, 0.6],
      ['test:water', false, 0.9],
      ['test:a', true, 0.9],
    ]);
  });
});

describe('buildVocabulary', () => {
  it('describes every sign and says where the signs come from', () => {
    const other = testPack([{ text: 'Hello', motion: 'scratch' }], 'other');
    const vocabulary = buildVocabulary([pack, other]);
    expect(vocabulary.size).toBe(4);
    expect(vocabulary.languages).toEqual(['en']);
    expect(vocabulary.references).toHaveLength(4);
    expect(vocabulary.describe('test:a')).toEqual({ text: 'A', language: 'en', letter: true, packId: 'test' });
    expect(vocabulary.describe('other:hello')?.packId).toBe('other');
    expect(vocabulary.describe('nothing')).toBeUndefined();
    expect(vocabulary.packs.map((p) => [p.id, p.signCount, p.source.name])).toEqual([
      ['test', 3, 'Test dictionary'],
      ['other', 1, 'Test dictionary'],
    ]);
  });

  it('keeps the first of two packs that use the same sign id', () => {
    const vocabulary = buildVocabulary([pack, pack]);
    expect(vocabulary.size).toBe(3);
    expect(vocabulary.references).toHaveLength(3);
  });
});

describe('loadBundledPacks', () => {
  it('reads every bundled pack and reports the ones it cannot use', async () => {
    const files: Record<number, string> = { 1: JSON.stringify(pack), 2: '{"format":"nope"}', 3: 'not json' };
    const result = await loadBundledPacks(
      [
        { id: 'good', asset: 1 },
        { id: 'wrong', asset: 2 },
        { id: 'broken', asset: 3 },
        { id: 'missing', asset: 4 },
      ],
      async (asset) => {
        if (!(asset in files)) throw new Error('not found');
        return files[asset]!;
      },
    );
    expect(result.packs.map((p) => p.id)).toEqual(['test']);
    expect(result.failed).toEqual(['wrong', 'broken', 'missing']);
  });

  it('has nothing to read when no pack is installed', async () => {
    const read = jest.fn();
    expect(await loadBundledPacks([], read)).toEqual({ packs: [], failed: [] });
    expect(read).not.toHaveBeenCalled();
  });
});
