import fixture from '../../../../shared/fixtures/model_parity_v1.json';
import { frameFor, MOTIONS, perform } from '@/test-utils/landmarks';
import { stabilizerConfigFor } from '@/recognition/engine';
import { UNKNOWN_LABEL } from '@/recognition/types';

import { ModelPackError, parseModelPack } from '../modelPack';
import { ModelSignRecognizer, withoutDepth } from '../ModelSignRecognizer';

const pack = () => parseModelPack(JSON.parse(JSON.stringify(fixture.pack)));

describe('ModelSignRecognizer', () => {
  it('describes itself from the pack', () => {
    const recognizer = new ModelSignRecognizer(pack());
    expect(recognizer.info).toMatchObject({ id: 'model:parity', kind: 'on_device', calibrated: false, windowSize: 32 });
    expect(recognizer.info.labels).toEqual([UNKNOWN_LABEL, 'test:1', 'test:2', 'test:3']);
  });

  it('scores every class when someone is signing', async () => {
    const recognizer = new ModelSignRecognizer(pack());
    await recognizer.load();
    const prediction = await recognizer.predict(perform(MOTIONS.wave!, { durationMs: 2200 }));
    expect(prediction.idle).toBeFalsy();
    expect(prediction.scores.map((s) => s.label)).toEqual([UNKNOWN_LABEL, 'test:1', 'test:2', 'test:3']);
    expect(prediction.scores.reduce((sum, s) => sum + s.score, 0)).toBeCloseTo(1, 6);
  });

  it('does not guess while the hands are down', async () => {
    const recognizer = new ModelSignRecognizer(pack());
    await recognizer.load();
    const resting = perform([{ right: { x: -0.4, y: 1.5, curl: [0.3, 0.3, 0.3, 0.3, 0.3] } }], { durationMs: 2200 });
    expect(await recognizer.predict(resting)).toMatchObject({ idle: true, scores: [{ label: UNKNOWN_LABEL, score: 1 }] });
  });

  it('runs the model itself when the camera engine fails, and stops asking it after repeated failures', async () => {
    const local = new ModelSignRecognizer(pack());
    await local.load();
    const signing = perform(MOTIONS.wave!, { durationMs: 2200 });
    const expected = await local.predict(signing);
    const remote = { available: true, load: jest.fn(), forward: jest.fn(() => Promise.reject(new Error('timeout'))) };
    const recognizer = new ModelSignRecognizer(pack(), remote);
    await recognizer.load();
    for (let i = 0; i < 3; i++) {
      const prediction = await recognizer.predict(signing);
      expect(prediction.scores.map((s) => s.score)).toEqual(expected.scores.map((s) => s.score));
    }
    expect(remote.forward).toHaveBeenCalledTimes(2);
  });

  it('must be loaded before predicting', async () => {
    await expect(new ModelSignRecognizer(pack()).predict([])).rejects.toThrow('not loaded');
  });

  it('drops depth, as the model was trained without it', () => {
    const frame = frameFor({ right: { x: -0.4, y: 0.2, curl: [0, 0, 0, 0, 0] } });
    frame[2] = 0.5;
    frame[92] = -0.3;
    const flat = withoutDepth(frame, 156);
    expect(flat[2]).toBe(0);
    expect(flat[92]).toBe(0);
    expect(flat[0]).toBe(frame[0]);
    expect(flat[155]).toBe(1);
  });

  it('carries the stabilizer settings tuned for the model', () => {
    const raw = JSON.parse(JSON.stringify(fixture.pack));
    expect(new ModelSignRecognizer(parseModelPack(raw)).info.stabilizer).toBeNull();
    expect(stabilizerConfigFor(new ModelSignRecognizer(parseModelPack(raw)).info)).toBeUndefined();

    raw.stabilizer = { minConfidence: 0.9, minMargin: 0.3, minStablePredictions: 7 };
    const info = new ModelSignRecognizer(parseModelPack(raw)).info;
    expect(info.stabilizer).toEqual({ minConfidence: 0.9, minMargin: 0.3, minStablePredictions: 7 });
    // Emergency signs are never less strict than the defaults or the tuned settings.
    expect(stabilizerConfigFor(info)).toEqual({
      minConfidence: 0.9,
      minMargin: 0.3,
      minStablePredictions: 7,
      emergencyMinConfidence: 0.9,
      emergencyMinStablePredictions: 7,
    });

    for (const bad of [{ minConfidence: 1.5, minMargin: 0.3, minStablePredictions: 4 }, { minConfidence: 0.8, minMargin: 0.3, minStablePredictions: 0 }, 'strict']) {
      raw.stabilizer = bad;
      expect(() => parseModelPack(raw)).toThrow(ModelPackError);
    }
  });
});
