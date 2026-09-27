import { FRAME_DIM } from '@/recognition/featureSpec';
import { handsRaised, REST_WRIST_Y } from '@/recognition/features';
import { UNKNOWN_LABEL, type LandmarkFrame } from '@/recognition/types';
import { frameFor, MOTIONS, perform, randomMotion, rng, type Motion, type PerformOptions } from '@/test-utils/landmarks';

import { encodeFrames } from '../codec';
import { compactFrame } from '../compact';
import { buildReferenceTemplates, buildTemplate, prepareQuery, type ReferenceSign } from '../matcher';
import { PrefilterIndex } from '../prefilter';
import { PREFILTER_FROM, ReferenceSignRecognizer } from '../ReferenceSignRecognizer';
import { handSpan, prepareSample, resampleByTime } from '../sample';

/** A dictionary-sized vocabulary of random synthetic movements, one recording each. */
const SIGN_COUNT = 250;
const motions: Motion[] = Array.from({ length: SIGN_COUNT }, (_, i) => randomMotion(1000 + i));
const durationOf = (i: number) => 900 + (i % 7) * 100;

function reference(i: number): ReferenceSign {
  const prepared = prepareSample(perform(motions[i]!, { seed: i, durationMs: durationOf(i), noise: 0.01 }));
  if (!prepared.ok) throw new Error(prepared.problem);
  return {
    id: `sign-${i}`,
    letter: false,
    samples: [{ frames: prepared.frames.length, dim: FRAME_DIM, data: encodeFrames(prepared.frames, FRAME_DIM) }],
    threshold: 0.9,
  };
}
const references = motions.map((_, i) => reference(i));
const templates = buildReferenceTemplates(references);
const index = new PrefilterIndex(templates);

/** Hands resting low at the end (on the lap) or held still in front of the body. */
function withTail(frames: LandmarkFrame[], y: number, seed: number): LandmarkFrame[] {
  const last = frames.at(-1)!.timestampMs;
  const tail = perform([{ right: { x: -0.4, y, curl: [0.3, 0.3, 0.3, 0.3, 0.3] } }], { seed, durationMs: 500, noise: 0.02, startMs: last + 67 });
  return [...frames, ...tail];
}

/** Another "signer": different speed, noise, position, sometimes left-handed. */
function performance(i: number, q: number, extra: PerformOptions = {}): LandmarkFrame[] {
  const random = rng(q);
  return perform(motions[i]!, {
    seed: 500 + q,
    durationMs: durationOf(i) * (0.75 + random() * 0.6),
    noise: 0.02,
    restBeforeMs: 600,
    restAfterMs: 300,
    startMs: 10000,
    mirror: q % 5 === 0,
    offset: { x: (random() - 0.5) * 0.2, y: (random() - 0.5) * 0.2 },
    ...extra,
  });
}

function query(frames: LandmarkFrame[]) {
  const end = frames.at(-1)!.timestampMs;
  return prepareQuery(resampleByTime(frames, end - 3000, end))!;
}

const QUERIES = 40;
const picks = Array.from({ length: QUERIES }, (_, q) => (q * 37) % SIGN_COUNT);

describe('PrefilterIndex', () => {
  it.each([
    ['hands leave the view', (frames: LandmarkFrame[]) => frames],
    ['hands rest low in view', (frames: LandmarkFrame[], q: number) => withTail(frames, 1.45, q)],
    ['hands are held still after the sign', (frames: LandmarkFrame[], q: number) => withTail(frames, 0.8, q)],
  ])('keeps the signed sign among the candidates when %s', (_, tail) => {
    const missed = picks.filter((i, q) => !index.candidates(query(tail(performance(i, q), q)), 24).some((t) => t.signId === `sign-${i}`));
    expect(missed).toEqual([]);
  });

  it('ranks candidates closest first and returns at most the number asked', () => {
    const i = picks[3]!;
    const candidates = index.candidates(query(performance(i, 3)), 5);
    expect(candidates).toHaveLength(5);
    expect(candidates[0]!.signId).toBe(`sign-${i}`);
  });
});

describe('ReferenceSignRecognizer with a large vocabulary', () => {
  it('recognizes signs among hundreds, via the first pass', async () => {
    expect(SIGN_COUNT).toBeGreaterThanOrEqual(PREFILTER_FROM);
    const recognizer = new ReferenceSignRecognizer(references);
    await recognizer.load();
    let correct = 0;
    for (const [q, i] of picks.slice(0, 20).entries()) {
      const prediction = await recognizer.predict(performance(i, q));
      const top = [...prediction.scores].sort((a, b) => b.score - a.score)[0]!;
      if (top.label === `sign-${i}`) correct += 1;
      // Never another sign with a high score.
      else expect(top.label).toBe(UNKNOWN_LABEL);
    }
    expect(correct).toBeGreaterThanOrEqual(19);
  });

  it('does not match a movement that is not in the vocabulary', async () => {
    const recognizer = new ReferenceSignRecognizer(references.slice(0, 60));
    await recognizer.load();
    const prediction = await recognizer.predict(perform(motions[200]!, { seed: 3, restBeforeMs: 500 }));
    const top = [...prediction.scores].sort((a, b) => b.score - a.score)[0]!;
    expect(top.label).toBe(UNKNOWN_LABEL);
  });
});

describe('hands resting low', () => {
  const low = frameFor({ right: { x: -0.4, y: REST_WRIST_Y + 0.2, curl: [0, 0, 0, 0, 0] } });
  const raised = frameFor({ right: { x: -0.4, y: 0.2, curl: [0, 0, 0, 0, 0] } });

  it('are in view but not signing', () => {
    expect(handsRaised(low)).toBe(false);
    expect(handsRaised(raised)).toBe(true);
    expect(handsRaised(null)).toBe(false);
  });

  it('count as absent when comparing frames, so a resting hand never spoils a match', () => {
    const oneHand = frameFor({ right: { x: -0.4, y: 0.2, curl: [0, 0, 0, 0, 0] } });
    const otherResting = frameFor({ right: { x: -0.4, y: 0.2, curl: [0, 0, 0, 0, 0] }, left: { x: 0.4, y: 1.5, curl: [0.3, 0.3, 0.3, 0.3, 0.3] } });
    const a = compactFrame(oneHand);
    const b = compactFrame(otherResting);
    // Same hand slots; only the elbow of the resting arm may differ.
    expect(Array.from(a.slice(0, 46))).toEqual(Array.from(b.slice(0, 46)));
  });

  it('are trimmed from recordings and from live signing', () => {
    const sign = perform(MOTIONS.wave!, { durationMs: 1000 });
    const rest = perform([{ right: { x: -0.4, y: 1.5, curl: [0.3, 0.3, 0.3, 0.3, 0.3] } }], { durationMs: 600 });
    const shifted = (frames: LandmarkFrame[], by: number) => frames.map((f) => ({ ...f, timestampMs: f.timestampMs + by }));
    const recording = [...rest, ...shifted(sign, 667), ...shifted(rest, 1734)];
    const values = recording.map((f) => f.values);
    const span = handSpan(values)!;
    expect(span[0]).toBeGreaterThanOrEqual(rest.length);
    expect(span[1]).toBeLessThan(rest.length + sign.length);

    const prepared = prepareSample(recording);
    expect(prepared.ok && prepared.frames.length).toBeLessThanOrEqual(sign.length + 1);
  });

  it('are not a sign on their own', () => {
    const resting = perform([{ right: { x: -0.4, y: 1.5, curl: [0.3, 0.3, 0.3, 0.3, 0.3] } }], { durationMs: 1500 });
    expect(prepareSample(resting)).toEqual({ ok: false, problem: 'no_hands' });
    expect(prepareQuery(resting.map((f) => f.values))).toBeNull();
  });
});

describe('explicit acceptance distances', () => {
  it('are used instead of measuring repeats (dictionary variants are not repeats)', () => {
    const twoTakes = { ...reference(0), samples: [...reference(0).samples, ...reference(1).samples] };
    expect(buildTemplate(twoTakes)!.threshold).toBe(0.9);
    const measured = buildTemplate({ ...twoTakes, threshold: undefined })!;
    expect(measured.threshold).not.toBe(0.9);
    expect(measured.wholes).toHaveLength(2);
  });
});
