import { RecognitionSession } from '@/recognition/session';
import { PredictionStabilizer } from '@/recognition/stabilizer';
import { RecognizerUnavailableError, UNKNOWN_LABEL, type FrameSource, type LandmarkFrame, type Recognition } from '@/recognition/types';
import {
  LEFT_HAND_PRESENT_INDEX,
  LEFT_HAND_START,
  RIGHT_HAND_PRESENT_INDEX,
  RIGHT_HAND_START,
} from '@/recognition/featureSpec';
import { MOTIONS, perform, rng, type PerformOptions } from '@/test-utils/landmarks';

import { buildTemplate } from '../matcher';
import { PersonalSignRecognizer } from '../PersonalSignRecognizer';
import { prepareSample } from '../sample';
import { withSample } from '../store';
import type { PersonalSign, SignTarget } from '../types';

/** Recording-to-recording variation: tracking noise, speed and position. */
const NOISE = 0.02;
const variations: PerformOptions[] = [
  { seed: 11, durationMs: 1100, offset: { x: 0.03, y: -0.02 } },
  { seed: 12, durationMs: 1300, offset: { x: -0.04, y: 0.03 } },
  { seed: 13, durationMs: 1200, offset: { x: 0, y: 0.05 } },
];

function teach(target: SignTarget, motion: keyof typeof MOTIONS, samples = variations): PersonalSign {
  let sign: PersonalSign | undefined;
  for (const options of samples) {
    const recording = perform(MOTIONS[motion]!, { noise: NOISE, restBeforeMs: 400, restAfterMs: 400, ...options });
    const prepared = prepareSample(recording);
    if (!prepared.ok) throw new Error(`could not prepare ${motion}: ${prepared.problem}`);
    sign = withSample(sign, target, prepared.frames);
  }
  return sign!;
}

const TAUGHT: [SignTarget, keyof typeof MOTIONS][] = [
  [{ kind: 'library', signId: 'hello' }, 'wave'],
  [{ kind: 'library', signId: 'water' }, 'knock'],
  [{ kind: 'custom', text: 'there', language: 'en' }, 'point_arc'],
  [{ kind: 'library', signId: 'friend' }, 'two_hands'],
  [{ kind: 'letter', letter: 's' }, 'hold_fist'],
  [{ kind: 'letter', letter: 'v' }, 'hold_two'],
  [{ kind: 'letter', letter: 'b' }, 'hold_open'],
];
const signs = TAUGHT.map(([target, motion]) => teach(target, motion));
const labelOf = (motion: keyof typeof MOTIONS) => signs[TAUGHT.findIndex(([, m]) => m === motion)]!.id;

class ScriptedSource implements FrameSource {
  readonly simulated = false;
  private handler: ((frame: LandmarkFrame) => void) | null = null;
  start(onFrame: (frame: LandmarkFrame) => void) {
    this.handler = onFrame;
  }
  stop() {
    this.handler = null;
  }
  async play(frames: LandmarkFrame[]) {
    for (const frame of frames) {
      this.handler?.(frame);
      // Let the (async) prediction for this frame finish, as on a phone.
      await Promise.resolve();
      await Promise.resolve();
    }
  }
}

async function recognizeLive(frames: LandmarkFrame[]): Promise<{ results: Recognition[]; statuses: string[] }> {
  const source = new ScriptedSource();
  const recognizer = new PersonalSignRecognizer(signs);
  const session = new RecognitionSession({
    source,
    recognizer,
    stabilizer: new PredictionStabilizer({ calibrated: false }),
    config: { stride: 3, requireHands: true },
  });
  const results: Recognition[] = [];
  const statuses: string[] = [];
  session.subscribe({
    onRecognition: (r) => results.push(r),
    onSnapshot: (s) => {
      if (s.status && statuses.at(-1) !== s.status) statuses.push(s.status);
    },
  });
  await session.start();
  await source.play(frames);
  session.stop();
  return { results, statuses };
}

const live = (motion: keyof typeof MOTIONS, options: PerformOptions = {}) =>
  perform(MOTIONS[motion]!, { noise: NOISE, seed: 99, durationMs: 1250, restBeforeMs: 1500, restAfterMs: 2500, ...options });

describe('PersonalSignRecognizer', () => {
  it('is unavailable until a sign has enough recordings', async () => {
    const one = teach({ kind: 'letter', letter: 'q' }, 'hold_fist', variations.slice(0, 1));
    await expect(new PersonalSignRecognizer([one]).load()).rejects.toBeInstanceOf(RecognizerUnavailableError);
    await expect(new PersonalSignRecognizer([]).load()).rejects.toBeInstanceOf(RecognizerUnavailableError);
  });

  it('derives each sign’s acceptance distance from its own repetitions', () => {
    const template = buildTemplate(signs[0]!)!;
    expect(template.threshold).toBeGreaterThanOrEqual(0.5);
    expect(template.threshold).toBeLessThanOrEqual(1.2);
  });

  it('scores a new repetition of a taught sign highest, with a clear margin', async () => {
    const recognizer = new PersonalSignRecognizer(signs);
    await recognizer.load();
    for (const [, motion] of TAUGHT) {
      const frames = live(motion, { restAfterMs: 300 });
      const prediction = await recognizer.predict(frames.slice(-45));
      const [first, second] = [...prediction.scores].sort((a, b) => b.score - a.score);
      expect({ motion, top: first!.label }).toEqual({ motion, top: labelOf(motion) });
      expect(first!.score - second!.score).toBeGreaterThan(0.15);
    }
  });

  it('reports rest and untaught movements as unknown or idle, never as a sign', async () => {
    const recognizer = new PersonalSignRecognizer(signs);
    await recognizer.load();
    const rest = await recognizer.predict(perform([{}], { durationMs: 2000 }));
    expect(rest.idle).toBe(true);
    const scratch = await recognizer.predict(live('scratch', { restAfterMs: 300 }).slice(-45));
    const top = [...scratch.scores].sort((a, b) => b.score - a.score)[0]!;
    expect(scratch.idle || top.label === UNKNOWN_LABEL).toBe(true);
  });
});

describe('live recognition of personal signs', () => {
  it.each(TAUGHT.map(([, motion]) => motion))('recognizes "%s" exactly once', async (motion) => {
    const { results } = await recognizeLive(live(motion));
    expect(results.map((r) => r.label)).toEqual([labelOf(motion)]);
    expect(results[0]!.band).toBeNull();
  });

  it('recognizes a left-handed signer from right-handed recordings', async () => {
    const { results } = await recognizeLive(live('point_arc', { mirror: true }));
    expect(results.map((r) => r.label)).toEqual([labelOf('point_arc')]);
  });

  it('copes with MediaPipe swapping the hand labels on some frames', async () => {
    const random = rng(3);
    const frames = live('point_arc').map((frame) => {
      if (!frame.values || random() > 0.3) return frame;
      const v = Float32Array.from(frame.values);
      const left = v.slice(LEFT_HAND_START, LEFT_HAND_START + 63);
      v.copyWithin(LEFT_HAND_START, RIGHT_HAND_START, RIGHT_HAND_START + 63);
      v.set(left, RIGHT_HAND_START);
      [v[LEFT_HAND_PRESENT_INDEX], v[RIGHT_HAND_PRESENT_INDEX]] = [v[RIGHT_HAND_PRESENT_INDEX]!, v[LEFT_HAND_PRESENT_INDEX]!];
      return { ...frame, values: v };
    });
    const { results } = await recognizeLive(frames);
    expect(results.map((r) => r.label)).toEqual([labelOf('point_arc')]);
  });

  it('recognizes a sign signed noticeably faster or slower', async () => {
    expect((await recognizeLive(live('knock', { durationMs: 900, seed: 5 }))).results.map((r) => r.label)).toEqual([
      labelOf('knock'),
    ]);
    expect((await recognizeLive(live('wave', { durationMs: 1700, seed: 6 }))).results.map((r) => r.label)).toEqual([
      labelOf('wave'),
    ]);
  });

  it('recognizes two signs in a row', async () => {
    const first = live('wave', { restAfterMs: 1500 });
    const second = live('knock', { startMs: first.at(-1)!.timestampMs + 67, restBeforeMs: 0 });
    const { results } = await recognizeLive([...first, ...second]);
    expect(results.map((r) => r.label)).toEqual([labelOf('wave'), labelOf('knock')]);
  });

  it('shows nothing for an untaught movement', async () => {
    const { results } = await recognizeLive(live('scratch'));
    expect(results).toEqual([]);
  });

  it('asks for hands when the signer is visible but not signing', async () => {
    const { results, statuses } = await recognizeLive(perform([{}], { durationMs: 4000 }));
    expect(results).toEqual([]);
    expect(statuses).toContain('no_hands');
  });
});
