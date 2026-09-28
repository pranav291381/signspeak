import { encodeFrames, toXY, XY_FRAME_DIM } from '@/personal/codec';
import { SIGN_PACK_FORMAT, SIGN_PACK_VERSION, type SignPack } from '@/signpack/types';

import { MOTIONS, perform } from './landmarks';

export interface TestMotionSign {
  text: string;
  motion?: keyof typeof MOTIONS;
  category?: string;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A motion pack of synthetic recordings (rest, the movement, rest), like scripts/build-motion-pack.mjs writes. */
export function testMotionPack(signs: TestMotionSign[], id = 'test-motion'): SignPack {
  return {
    format: SIGN_PACK_FORMAT,
    version: SIGN_PACK_VERSION,
    id,
    name: 'Test signs',
    featureSpecVersion: 1,
    sampleFps: 15,
    source: { name: 'Test signers', url: 'https://example.org/', permission: 'Made for tests.' },
    createdAt: '2026-09-28T00:00:00.000Z',
    signs: signs.map(({ text, motion = 'wave', category }, k) => {
      const frames = perform(MOTIONS[motion]!, { seed: 5 + k, durationMs: 1000, restBeforeMs: 300, restAfterMs: 300 }).map((f) => toXY(f.values!));
      return {
        id: `${id}:${slug(text)}`,
        text,
        language: 'en' as const,
        ...(category ? { category } : {}),
        samples: [{ frames: frames.length, dim: XY_FRAME_DIM, data: encodeFrames(frames, XY_FRAME_DIM) }],
      };
    }),
  };
}
