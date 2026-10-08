import fixture from '../../../../shared/fixtures/segment_parity_v2.json';
import { parseModelPack } from '@/model/modelPack';
import { createRecognitionSession } from '@/recognition/engine';
import { RIGHT_HAND_PRESENT_INDEX, RIGHT_HAND_START } from '@/recognition/featureSpec';
import { UNKNOWN_LABEL, type FrameSource, type LandmarkFrame, type RawPrediction, type RecognizerInfo, type SignRecognizer } from '@/recognition/types';
import { MOTIONS, perform } from '@/test-utils/landmarks';
import { taughtSign } from '@/test-utils/signs';

import { personalReferences } from '../matcher';
import { PersonalizedRecognizer } from '../PersonalizedRecognizer';
import { isVocabularyLabel, sanitizeSign, signIdFor } from '../store';

const LABELS = ['include:water', 'include:wave', 'include:knock', 'include:tea', 'include:milk', 'include:rice', 'include:salt'];
const answer = (scores: Record<string, number>): RawPrediction => ({
  scores: LABELS.map((label) => ({ label, score: scores[label] ?? 0.004 })),
  latencyMs: 1,
});
// What the model makes of each movement: a hand held high ("wave") it mostly takes for water.
const HIGH = answer({ 'include:water': 0.6, 'include:wave': 0.3, 'include:tea': 0.08 });
const LOW = answer({ 'include:knock': 0.9, 'include:water': 0.05, 'include:wave': 0.02, 'include:milk': 0.01 });

/** A model that sees only how high the right hand is. */
class HeightModel implements SignRecognizer {
  readonly info: RecognizerInfo = {
    id: 'model:test',
    kind: 'on_device',
    version: '1',
    labels: LABELS,
    calibrated: true,
    featureSpecVersion: 1,
    windowSize: 32,
    stabilizer: { minConfidence: 0.8, minMargin: 0, minStablePredictions: 1 },
    mode: 'segment',
  };
  loaded = false;
  disposed = false;
  calls = 0;
  constructor(private readonly high = HIGH) {}
  async load() {
    this.loaded = true;
  }
  async predict(window: readonly LandmarkFrame[]): Promise<RawPrediction> {
    this.calls += 1;
    const ys = window.filter((f) => f.values && f.values[RIGHT_HAND_PRESENT_INDEX]! > 0.5).map((f) => f.values![RIGHT_HAND_START + 1]!);
    if (ys.length < 3) return { scores: [{ label: UNKNOWN_LABEL, score: 1 }], latencyMs: 0, idle: true };
    return ys.reduce((a, b) => a + b, 0) / ys.length < 0 ? this.high : LOW;
  }
  dispose() {
    this.disposed = true;
  }
}

// The person taught "wave" (a sign of the model) and their own word "chai", their way.
const taught = [
  taughtSign({ kind: 'vocabulary', label: 'include:wave', text: 'Wave', language: 'en' }, 'wave', 3),
  taughtSign({ kind: 'custom', text: 'chai', language: 'en' }, 'two_hands', 3),
];

const signed = (motion: keyof typeof MOTIONS, seed = 5): LandmarkFrame[] =>
  perform(MOTIONS[motion]!, { seed, durationMs: 1150, noise: 0.01, restBeforeMs: 300, restAfterMs: 300 });

const scoreOf = (prediction: RawPrediction, label: string) => prediction.scores.find((s) => s.label === label)?.score ?? 0;
const top = (prediction: RawPrediction) => [...prediction.scores].sort((a, b) => b.score - a.score)[0]!;

async function recognizer(model = new HeightModel(), signs = taught) {
  const r = new PersonalizedRecognizer(model, personalReferences(signs));
  await r.load();
  await r.viewsReady;
  return { r, model };
}

describe('PersonalizedRecognizer', () => {
  it('knows the model’s signs and the taught ones, keeps the model’s settings, and is never calibrated', async () => {
    const { r, model } = await recognizer();
    expect(model.loaded).toBe(true);
    expect(r.info.labels).toEqual([...LABELS, 'custom:chai']);
    expect(r.info).toMatchObject({ mode: 'segment', stabilizer: model.info.stabilizer, calibrated: false });
    r.dispose();
    expect(model.disposed).toBe(true);
  });

  it('shows the person’s own version of a sign over the model’s guess', async () => {
    const { r } = await recognizer();
    const prediction = await r.predict(signed('wave'));
    expect(top(prediction).label).toBe('include:wave');
    expect(top(prediction).score).toBeGreaterThan(0.8);
    // The model sees this attempt as it saw the person's takes.
    expect(prediction.confirmed).toBe('include:wave');
    expect(prediction.scores.reduce((sum, s) => sum + s.score, 0)).toBeCloseTo(1, 5);
  });

  it('leaves a sign that was not taught to the model', async () => {
    const { r } = await recognizer();
    const prediction = await r.predict(signed('knock'));
    expect(top(prediction).label).toBe('include:knock');
    expect(prediction.confirmed).toBeUndefined();
    expect(scoreOf(prediction, 'include:knock')).toBeGreaterThan(0.9);
    expect(scoreOf(prediction, 'include:wave')).toBeLessThan(0.02);
  });

  it('only moves signs the model itself finds plausible', async () => {
    // The model puts "wave" last: the person's takes cannot bring it back.
    const unlikely = answer({ 'include:water': 0.5, 'include:tea': 0.2, 'include:milk': 0.1, 'include:rice': 0.1, 'include:salt': 0.05, 'include:wave': 0.0001 });
    const { r } = await recognizer(new HeightModel(unlikely));
    const prediction = await r.predict(signed('wave'));
    expect(top(prediction).label).toBe('include:water');
    expect(scoreOf(prediction, 'include:wave')).toBeLessThan(0.01);
  });

  it('computes the model’s view of each take once, even for a new session, until the model changes', async () => {
    const version = (v: string) => Object.assign(new HeightModel(), { info: { ...new HeightModel().info, version: v } });
    const first = await recognizer(version('cache-test'));
    const again = await recognizer(version('cache-test'));
    const updated = await recognizer(version('cache-test-2'));
    // Three takes of "wave"; "chai" is not a sign of the model.
    expect([first.model.calls, again.model.calls, updated.model.calls]).toEqual([3, 0, 3]);
  });

  it('recognizes a taught word the model does not know', async () => {
    const { r } = await recognizer();
    expect(top(await r.predict(signed('two_hands'))).label).toBe('custom:chai');
  });

  it('passes on "nothing signed" from the model', async () => {
    const { r } = await recognizer();
    const resting = perform([{}], { durationMs: 1000 });
    expect(await r.predict(resting)).toMatchObject({ idle: true });
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
