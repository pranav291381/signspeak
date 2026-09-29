import fixture from '../../../../shared/fixtures/segment_parity_v2.json';
import { parseModelPack } from '@/model/modelPack';
import { createRecognitionSession } from '@/recognition/engine';
import { UNKNOWN_LABEL, type FrameSource, type LandmarkFrame, type RawPrediction, type RecognizerInfo, type SignRecognizer } from '@/recognition/types';
import { MOTIONS, perform } from '@/test-utils/landmarks';
import { taughtSign } from '@/test-utils/signs';

import { personalReferences } from '../matcher';
import { PersonalizedRecognizer } from '../PersonalizedRecognizer';
import { isVocabularyLabel, sanitizeSign, signIdFor } from '../store';

/** A model that always answers the same, whatever is signed. */
class FixedModel implements SignRecognizer {
  readonly info: RecognizerInfo = {
    id: 'model:test',
    kind: 'on_device',
    version: '1',
    labels: ['include:water', 'include:wave'],
    calibrated: true,
    featureSpecVersion: 1,
    windowSize: 32,
    stabilizer: { minConfidence: 0.8, minMargin: 0, minStablePredictions: 1 },
    mode: 'segment',
  };
  loaded = false;
  disposed = false;
  constructor(private readonly answer: RawPrediction) {}
  async load() {
    this.loaded = true;
  }
  async predict(): Promise<RawPrediction> {
    return this.answer;
  }
  dispose() {
    this.disposed = true;
  }
}

const modelSaysWater: RawPrediction = {
  scores: [
    { label: 'include:water', score: 0.9 },
    { label: 'include:wave', score: 0.1 },
  ],
  latencyMs: 1,
};

// The person taught "wave" (a sign of the model) and their own word "chai", their way.
const taught = [
  taughtSign({ kind: 'vocabulary', label: 'include:wave', text: 'Wave', language: 'en' }, 'wave', 3),
  taughtSign({ kind: 'custom', text: 'chai', language: 'en' }, 'two_hands', 3),
];

const signed = (motion: keyof typeof MOTIONS, seed = 5): LandmarkFrame[] =>
  perform(MOTIONS[motion]!, { seed, durationMs: 1150, noise: 0.01, restBeforeMs: 300, restAfterMs: 300 });

const scoreOf = (prediction: RawPrediction, label: string) => prediction.scores.find((s) => s.label === label)?.score ?? 0;
const top = (prediction: RawPrediction) => [...prediction.scores].sort((a, b) => b.score - a.score)[0]!;

async function recognizer(answer = modelSaysWater) {
  const model = new FixedModel(answer);
  const r = new PersonalizedRecognizer(model, personalReferences(taught));
  await r.load();
  return { r, model };
}

describe('PersonalizedRecognizer', () => {
  it('knows the model’s signs and the taught ones, keeps the model’s settings, and is never calibrated', async () => {
    const { r, model } = await recognizer();
    expect(model.loaded).toBe(true);
    expect(r.info.labels).toEqual(['include:water', 'include:wave', 'custom:chai']);
    expect(r.info).toMatchObject({ mode: 'segment', stabilizer: model.info.stabilizer, calibrated: false });
    r.dispose();
    expect(model.disposed).toBe(true);
  });

  it('shows the person’s own version of a sign over the model’s guess', async () => {
    const { r } = await recognizer();
    const prediction = await r.predict(signed('wave'));
    expect(top(prediction).label).toBe('include:wave');
    expect(top(prediction).score).toBeGreaterThan(0.8);
    expect(prediction.scores.reduce((sum, s) => sum + s.score, 0)).toBeCloseTo(1, 5);
  });

  it('recognizes a taught word the model does not know', async () => {
    const { r } = await recognizer();
    expect(top(await r.predict(signed('two_hands'))).label).toBe('custom:chai');
  });

  it('leaves the model’s answer as it is for a sign that was not taught', async () => {
    const { r } = await recognizer();
    const prediction = await r.predict(signed('knock'));
    expect(top(prediction).label).toBe('include:water');
    expect(scoreOf(prediction, 'include:water')).toBeGreaterThan(0.85);
  });

  it('passes on "nothing signed" from the model', async () => {
    const idle: RawPrediction = { scores: [{ label: UNKNOWN_LABEL, score: 1 }], latencyMs: 0, idle: true };
    const { r } = await recognizer(idle);
    expect(await r.predict(signed('wave'))).toBe(idle);
  });
});

describe('vocabulary signs taught on the phone', () => {
  it('are stored under the model’s own label, and read back', () => {
    const target = { kind: 'vocabulary', label: 'include:good-morning', text: 'Good morning', language: 'en' } as const;
    expect(signIdFor(target)).toBe('include:good-morning');
    const sign = taughtSign(target, 'wave', 2);
    expect(sanitizeSign(JSON.parse(JSON.stringify(sign)))).toMatchObject({ id: 'include:good-morning', target });
  });

  it('only accept model labels that cannot be mistaken for other personal signs', () => {
    expect(isVocabularyLabel('include:teacher')).toBe(true);
    for (const label of ['custom:chai', 'letter:a', 'library:hello', 'teacher', 'include:', 'Include:Teacher', 'a:b:c']) {
      expect(isVocabularyLabel(label)).toBe(false);
    }
    const forged = { ...taughtSign({ kind: 'custom', text: 'x', language: 'en' }), target: { kind: 'vocabulary', label: 'custom:x', text: 'x', language: 'en' } };
    expect(sanitizeSign(forged)).toBeNull();
  });
});

describe('createRecognitionSession with a model and taught signs', () => {
  const source: FrameSource = { simulated: false, start: () => undefined, stop: () => undefined };
  const pack = () => parseModelPack(JSON.parse(JSON.stringify(fixture.pack)));

  it('combines them', () => {
    const session = createRecognitionSession({ demoMode: false, model: pack(), signs: taught, source });
    expect(session.getSnapshot().recognizer.id).toMatch(/\+personal$/);
  });

  it('uses the model alone when nothing (usable) was taught', () => {
    const once = [taughtSign({ kind: 'custom', text: 'chai', language: 'en' }, 'two_hands', 1)];
    const session = createRecognitionSession({ demoMode: false, model: pack(), signs: once, source });
    expect(session.getSnapshot().recognizer.id).not.toMatch(/\+personal$/);
  });
});
