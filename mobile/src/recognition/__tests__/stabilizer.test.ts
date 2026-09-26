import { PredictionStabilizer } from '../stabilizer';
import { UNKNOWN_LABEL, type RawPrediction, type StabilizerStep } from '../types';

const STEP_MS = 267; // 4 frames at 15 fps

function pred(scores: Record<string, number>): RawPrediction {
  return { scores: Object.entries(scores).map(([label, score]) => ({ label, score })), latencyMs: 5 };
}

/** One confident prediction for `label`, with the remainder spread over a distractor. */
function confident(label: string, score = 0.92): RawPrediction {
  return pred({ [label]: score, OTHER: 1 - score });
}

function run(stabilizer: PredictionStabilizer, inputs: (RawPrediction | null)[], startMs = 0): StabilizerStep[] {
  return inputs.map((p, i) => stabilizer.update(p, startMs + i * STEP_MS));
}

function recognized(steps: StabilizerStep[]): string[] {
  return steps.filter((s) => s.status === 'recognized').map((s) => s.recognition!.label);
}

const EMERGENCY = new Set(['HELP', 'PAIN']);
const make = (calibrated = false) =>
  new PredictionStabilizer({ isEmergency: (l) => EMERGENCY.has(l), calibrated });

describe('PredictionStabilizer', () => {
  it('recognizes a sign only after the minimum number of stable predictions', () => {
    const steps = run(make(), Array(4).fill(confident('HELLO')));
    expect(steps.slice(0, 3).map((s) => s.status)).toEqual(['analyzing', 'analyzing', 'analyzing']);
    expect(steps[3]).toMatchObject({ status: 'recognized', recognition: { label: 'HELLO' } });
  });

  it('stays uncertain for an unstable sequence (HELLO, NO, WATER, HELLO …) and never guesses', () => {
    const noisy = ['HELLO', 'NO', 'WATER', 'HELLO', 'NO', 'WATER', 'HELLO', 'NO', 'WATER', 'HELLO'].map((l) =>
      confident(l, 0.9),
    );
    const steps = run(make(), noisy);
    expect(recognized(steps)).toEqual([]);
    expect(steps.at(-1)?.status).toBe('uncertain');
  });

  it('reports low confidence and never emits below the threshold', () => {
    const steps = run(make(), Array(12).fill(pred({ HELLO: 0.55, NO: 0.2, WATER: 0.25 })));
    expect(recognized(steps)).toEqual([]);
    expect(steps.at(-1)).toEqual({ status: 'uncertain', reason: 'low_confidence' });
  });

  it('treats two close scores as ambiguous', () => {
    const steps = run(make(), Array(12).fill(pred({ HELLO: 0.74, NO: 0.66 })));
    expect(recognized(steps)).toEqual([]);
    expect(steps.at(-1)).toEqual({ status: 'uncertain', reason: 'ambiguous' });
  });

  it('never outputs the unknown class as a sign', () => {
    const steps = run(make(), Array(12).fill(pred({ [UNKNOWN_LABEL]: 0.97, HELLO: 0.03 })));
    expect(recognized(steps)).toEqual([]);
    expect(steps.at(-1)).toEqual({ status: 'uncertain', reason: 'unknown_sign' });
  });

  it('does not report uncertainty until enough activity has passed', () => {
    const stabilizer = make();
    const steps = run(stabilizer, Array(7).fill(pred({ HELLO: 0.5, NO: 0.5 })));
    expect(steps.every((s) => s.status === 'analyzing')).toBe(true);
    expect(stabilizer.update(pred({ HELLO: 0.5, NO: 0.5 }), 8 * STEP_MS).status).toBe('uncertain');
  });

  describe('emergency signs', () => {
    it('are not shown at a confidence that is enough for ordinary signs', () => {
      const steps = run(make(), Array(12).fill(confident('HELP', 0.8)));
      expect(recognized(steps)).toEqual([]);
      expect(steps.at(-1)).toEqual({ status: 'uncertain', reason: 'low_confidence' });
    });

    it('need more stable predictions', () => {
      const steps = run(make(), Array(6).fill(confident('HELP', 0.95)));
      expect(steps.slice(0, 5).some((s) => s.status === 'recognized')).toBe(false);
      expect(steps[5]).toMatchObject({ status: 'recognized', recognition: { label: 'HELP' } });
    });
  });

  it('shows a held sign once, not repeatedly', () => {
    const steps = run(make(), Array(30).fill(confident('HELLO')));
    expect(recognized(steps)).toEqual(['HELLO']);
    expect(steps.at(-1)?.status).toBe('analyzing');
  });

  it('shows a repeated sign again after it was released and the suppression time passed', () => {
    const stabilizer = make();
    const first = run(stabilizer, Array(4).fill(confident('HELLO')));
    const gap = run(stabilizer, [null, null], 4 * STEP_MS);
    // 6 steps * 267ms = 1.6s since emission: still inside the 2.5s suppression window.
    const early = run(stabilizer, Array(4).fill(confident('HELLO')), 6 * STEP_MS);
    const later = run(stabilizer, [null], 10 * STEP_MS);
    const again = run(stabilizer, Array(4).fill(confident('HELLO')), 11 * STEP_MS);
    expect(recognized(first)).toEqual(['HELLO']);
    expect(gap.map((s) => s.status)).toEqual(['no_signer', 'no_signer']);
    expect(recognized(early)).toEqual([]);
    expect(later[0]?.status).toBe('no_signer');
    expect(recognized(again)).toEqual(['HELLO']);
  });

  it('waits for the cooldown before showing a different sign', () => {
    const stabilizer = new PredictionStabilizer({ config: { smoothingWindow: 1, cooldownMs: 3000 } });
    const first = run(stabilizer, Array(4).fill(confident('HELLO')));
    // Starts right after HELLO: stable after 4 steps (~1s) but cooldown is 3s.
    const next = run(stabilizer, Array(12).fill(confident('THANK_YOU')), 4 * STEP_MS);
    expect(recognized(first)).toEqual(['HELLO']);
    const emitted = next.findIndex((s) => s.status === 'recognized');
    expect(emitted).toBeGreaterThan(3);
    expect((4 + emitted) * STEP_MS - 3 * STEP_MS).toBeGreaterThanOrEqual(3000);
    expect(recognized(next)).toEqual(['THANK_YOU']);
  });

  it('reports when nobody is in view and restarts the count', () => {
    const stabilizer = make();
    run(stabilizer, Array(3).fill(confident('HELLO')));
    expect(stabilizer.update(null, 3 * STEP_MS)).toEqual({ status: 'no_signer' });
    const steps = run(stabilizer, Array(3).fill(confident('HELLO')), 4 * STEP_MS);
    expect(recognized(steps)).toEqual([]);
  });

  it('smooths a single outlier prediction instead of reacting to it', () => {
    const inputs = [confident('HELLO'), confident('HELLO'), confident('WATER', 0.95), confident('HELLO'), confident('HELLO')];
    const steps = run(make(), inputs);
    expect(recognized(steps)).not.toContain('WATER');
  });

  describe('confidence bands', () => {
    it('are hidden when the recognizer is not calibrated', () => {
      const steps = run(make(false), Array(4).fill(confident('HELLO', 0.99)));
      expect(steps[3]?.recognition?.band).toBeNull();
    });

    it('are reported when calibrated', () => {
      expect(run(make(true), Array(4).fill(confident('HELLO', 0.95)))[3]?.recognition?.band).toBe('high');
      expect(run(make(true), Array(4).fill(confident('HELLO', 0.8)))[3]?.recognition?.band).toBe('medium');
    });
  });

  it('treats non-finite scores from a malfunctioning model as no evidence', () => {
    const steps = run(make(), Array(10).fill(pred({ HELLO: Number.NaN, NO: Number.POSITIVE_INFINITY })));
    expect(recognized(steps)).toEqual([]);
    expect(steps.at(-1)?.status).toBe('uncertain');
  });

  it('clears everything on reset', () => {
    const stabilizer = make();
    run(stabilizer, Array(4).fill(confident('HELLO')));
    stabilizer.reset();
    // Without the reset this would be suppressed as a duplicate.
    expect(recognized(run(stabilizer, Array(4).fill(confident('HELLO')), 5 * STEP_MS))).toEqual(['HELLO']);
  });

  it('rejects invalid configuration', () => {
    expect(() => new PredictionStabilizer({ config: { minConfidence: 1.5 } })).toThrow(/minConfidence/);
    expect(() => new PredictionStabilizer({ config: { emergencyMinConfidence: 0.5 } })).toThrow(/emergencyMinConfidence/);
    expect(() => new PredictionStabilizer({ config: { smoothingWindow: 0 } })).toThrow(/smoothingWindow/);
  });
});
