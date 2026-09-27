import fixture from '../../../../shared/fixtures/model_parity_v1.json';
import { encodeFrames, toXY, XY_FRAME_DIM } from '@/personal/codec';
import { MOTIONS, perform } from '@/test-utils/landmarks';

import { choose, grid, splitOf, tune, type Outcome, type Row } from '../../../scripts/lib/tune-model';

const outcome = (minConfidence: number, correct: number, wrong: number): Outcome => ({
  minConfidence,
  minMargin: 0.15,
  minStablePredictions: 4,
  correct,
  wrong,
  notSure: 1 - correct - wrong,
});

const row = (text: string, group: string, motion = MOTIONS.wave!): Row => {
  const frames = perform(motion, { durationMs: 1800 }).map((f) => toXY(f.values!));
  return { text, group, recording: { frames: frames.length, dim: XY_FRAME_DIM, data: encodeFrames(frames, XY_FRAME_DIM) } };
};

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('model stabilizer tuning (scripts/tune-model.mjs)', () => {
  it('holds out recordings like the training script: last group test, the one before validation', () => {
    const rows = ['a', 'c', 'b', 'd'].map((g) => ({ text: 'hello', group: g, recording: { frames: 0, dim: 105, data: '' } }));
    const two = [{ text: 'water', group: 'x', recording: { frames: 0, dim: 105, data: '' } }, { text: 'water', group: 'y', recording: { frames: 0, dim: 105, data: '' } }];
    const split = splitOf([...rows, ...two]);
    expect(rows.map(split)).toEqual(['train', 'val', 'train', 'test']);
    expect(two.map(split)).toEqual(['train', 'test']);
  });

  it('chooses the most right signs among settings with few enough wrong ones', () => {
    const outcomes = [outcome(0.5, 0.6, 0.2), outcome(0.7, 0.5, 0.05), outcome(0.8, 0.5, 0.03), outcome(0.9, 0.3, 0.01)];
    expect(choose(outcomes, 0.05)?.minConfidence).toBe(0.8);
    expect(choose(outcomes, 0.25)?.minConfidence).toBe(0.5);
    expect(choose(outcomes, 0.001)).toBeNull();
  });

  it('only tries valid settings, including the app defaults', () => {
    expect(grid().every((s) => s.minMargin < s.minConfidence && s.minStablePredictions >= 1)).toBe(true);
    expect(grid()).toContainEqual({ minConfidence: 0.7, minMargin: 0.15, minStablePredictions: 4 });
  });

  it('plays held-out recordings through the app session for every setting', async () => {
    const rows = ['s1', 's2', 's3'].map((g) => row('1', g));
    const options = { pack: JSON.parse(JSON.stringify(fixture.pack)), rows, split: 'test' as const, maxWrong: 1 };
    // Predictions here resolve within a few microtasks (checked to match a macrotask per frame, as in Node).
    const result = await tune({ ...options, nextTask: settle });
    expect(result).toMatchObject({ recordings: 1, signs: 1 });
    expect(result.outcomes).toHaveLength(grid().length);
    for (const o of result.outcomes) expect(o.correct + o.wrong + o.notSure).toBeCloseTo(1, 9);
    expect(result.defaults).toBeDefined();
    expect(result.chosen).not.toBeNull();
  });
});
