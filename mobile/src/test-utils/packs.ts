import { encodeFrames, toXY, XY_FRAME_DIM } from '@/personal/codec';
import { prepareSample, SAMPLE_FPS } from '@/personal/sample';
import { FEATURE_SPEC_VERSION } from '@/recognition/featureSpec';
import { SIGN_PACK_FORMAT, SIGN_PACK_VERSION, type SignPack, type SignPackSample } from '@/signpack/types';

import { MOTIONS, perform, type PerformOptions } from './landmarks';

/** One synthetic recording of `motion`, stored as the sign pack builder does (without depth). */
export function packSample(motion: keyof typeof MOTIONS, options: PerformOptions = {}): SignPackSample {
  const prepared = prepareSample(perform(MOTIONS[motion]!, { seed: 40, durationMs: 1100, ...options }));
  if (!prepared.ok) throw new Error(prepared.problem);
  return { frames: prepared.frames.length, dim: XY_FRAME_DIM, data: encodeFrames(prepared.frames.map(toXY), XY_FRAME_DIM) };
}

/** A sign pack of synthetic signs (test movements, not ISL). */
export function testPack(signs: { text: string; motion: keyof typeof MOTIONS; letter?: boolean }[], id = 'test'): SignPack {
  return {
    format: SIGN_PACK_FORMAT,
    version: SIGN_PACK_VERSION,
    id,
    name: 'Test pack',
    featureSpecVersion: FEATURE_SPEC_VERSION,
    sampleFps: SAMPLE_FPS,
    source: { name: 'Test dictionary', url: 'https://example.org/', permission: 'Test data' },
    createdAt: '2026-01-01T00:00:00.000Z',
    defaultThreshold: 0.9,
    signs: signs.map(({ text, motion, letter }) => ({
      id: `${id}:${text.toLowerCase()}`,
      text,
      language: 'en',
      ...(letter ? { letter: true } : {}),
      samples: [packSample(motion)],
    })),
  };
}
