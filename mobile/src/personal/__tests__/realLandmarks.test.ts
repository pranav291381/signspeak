/**
 * Recognition on real MediaPipe output (see fixtures/mediapipe_hands.json):
 * the app's engine tracked real hand photos, so this checks that genuine
 * tracking noise and hand geometry work with the matcher, not only synthetic data.
 */
import { RecognitionSession } from '@/recognition/session';
import { PredictionStabilizer } from '@/recognition/stabilizer';
import type { FrameSource, LandmarkFrame, Recognition } from '@/recognition/types';

import fixture from './fixtures/mediapipe_hands.json';
import { buildTemplate, prepareQuery, relativeDistance } from '../matcher';
import { PersonalSignRecognizer } from '../PersonalSignRecognizer';
import { prepareSample } from '../sample';
import { withSample } from '../store';
import type { PersonalSign } from '../types';

type Shape = keyof typeof fixture.frames;
const STEP_MS = 1000 / 15;
const rest = fixture.frames.rest.map((v) => Float32Array.from(v));

const resting = (count: number, offset: number) => Array.from({ length: count }, (_, i) => rest[(offset + i) % rest.length]!);

/** A performance: resting, holding the handshape, resting again, at 15 fps. */
function performance(shape: Shape, from: number, count: number, restAfter = 12): LandmarkFrame[] {
  const held = fixture.frames[shape].slice(from, from + count).map((v) => Float32Array.from(v));
  const values = [...resting(8, from), ...held, ...resting(restAfter, from + 8)];
  return values.map((v, i) => ({ timestampMs: i * STEP_MS, values: v }));
}

function teach(shape: Shape): PersonalSign {
  let sign: PersonalSign | undefined;
  for (const from of [0, 10]) {
    const prepared = prepareSample(performance(shape, from, 10));
    if (!prepared.ok) throw new Error(prepared.problem);
    sign = withSample(sign, { kind: 'custom', text: shape, language: 'en' }, prepared.frames);
  }
  return sign!;
}

const taught = (['victory', 'fist', 'point'] as const).map(teach);

class Source implements FrameSource {
  readonly simulated = false;
  handler: ((frame: LandmarkFrame) => void) | null = null;
  start(onFrame: (frame: LandmarkFrame) => void) {
    this.handler = onFrame;
  }
  stop() {
    this.handler = null;
  }
}

async function recognize(frames: LandmarkFrame[]): Promise<string[]> {
  const source = new Source();
  const session = new RecognitionSession({
    source,
    recognizer: new PersonalSignRecognizer(taught),
    stabilizer: new PredictionStabilizer(),
    config: { stride: 3, requireHands: true },
  });
  const results: Recognition[] = [];
  session.subscribe({ onRecognition: (r) => results.push(r) });
  await session.start();
  for (const frame of frames) {
    source.handler?.(frame);
    await Promise.resolve();
    await Promise.resolve();
  }
  session.stop();
  return results.map((r) => r.label);
}

describe('personal signs on real MediaPipe landmarks', () => {
  it('keeps repetitions of a handshape close and different handshapes apart', () => {
    for (const sign of taught) {
      const template = buildTemplate(sign)!;
      for (const other of ['victory', 'fist', 'point'] as const) {
        const query = prepareQuery(performance(other, 20, 10).map((f) => f.values))!;
        const r = relativeDistance(template, query);
        if (sign.id === `custom:${other}`) expect({ sign: sign.id, other, r: r < 0.8 }).toEqual({ sign: sign.id, other, r: true });
        else expect({ sign: sign.id, other, r: r > 1.2 }).toEqual({ sign: sign.id, other, r: true });
      }
    }
  });

  it.each(['victory', 'fist', 'point'] as const)('recognizes a new repetition of "%s"', async (shape) => {
    // Long enough rest afterwards for the recognizer's window (as in continuous use).
    expect(await recognize(performance(shape, 20, 10, 40))).toEqual([`custom:${shape}`]);
  });

  it('shows nothing for a handshape that was not taught', async () => {
    expect(await recognize(performance('thumb', 0, 12, 40))).toEqual([]);
  });
});
