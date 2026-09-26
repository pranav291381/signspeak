import {
  RecognizerUnavailableError,
  UNKNOWN_LABEL,
  type LandmarkFrame,
  type RawPrediction,
  type RecognizerInfo,
  type SignRecognizer,
} from '@/recognition/types';

import { buildTemplates, prepareQuery, relativeDistance, type SignTemplate } from './matcher';
import { resampleByTime } from './sample';
import type { PersonalSign } from './types';

/** Recent time that is matched: long enough for one sign with its lead-in. */
export const PERSONAL_WINDOW_MS = 3000;
/** Frames needed before the first prediction (≈ 0.5 s at 15 fps). */
export const PERSONAL_MIN_FRAMES = 8;
/**
 * Scores are a softmax over −SHARPNESS × relative distance, with "unknown" at
 * relative distance 1. A sign well inside its acceptance distance scores high;
 * two similar signs share the score, so the stabilizer's margin rule rejects them.
 */
const SHARPNESS = 6;
/** Beyond this relative distance nothing sign-like is happening (e.g. resting hands). */
const IDLE_DISTANCE = 2;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Recognizes the signs taught on this phone. It only knows those signs, and
 * says so ("unknown") for anything else instead of guessing.
 */
export class PersonalSignRecognizer implements SignRecognizer {
  readonly info: RecognizerInfo;
  private templates: SignTemplate[] = [];

  constructor(private readonly signs: readonly PersonalSign[]) {
    this.info = {
      id: 'personal-dtw',
      kind: 'on_device',
      version: '1',
      labels: signs.map((s) => s.id),
      calibrated: false,
      featureSpecVersion: 1,
      windowSize: PERSONAL_MIN_FRAMES,
      windowMs: PERSONAL_WINDOW_MS,
    };
  }

  async load(): Promise<void> {
    this.templates = buildTemplates(this.signs);
    if (this.templates.length === 0) {
      throw new RecognizerUnavailableError('No personal signs with enough recordings');
    }
  }

  async predict(window: readonly LandmarkFrame[]): Promise<RawPrediction> {
    const started = now();
    const end = window.at(-1)?.timestampMs ?? 0;
    const query = prepareQuery(resampleByTime(window, end - PERSONAL_WINDOW_MS, end));
    if (!query) {
      return { scores: [{ label: UNKNOWN_LABEL, score: 1 }], latencyMs: now() - started, idle: true };
    }

    const distances = this.templates.map((t) => ({ label: t.signId, r: relativeDistance(t, query) }));
    const best = Math.min(...distances.map((d) => d.r));
    const logits = [...distances, { label: UNKNOWN_LABEL, r: 1 }].map((d) => ({ label: d.label, logit: -SHARPNESS * d.r }));
    const max = Math.max(...logits.map((l) => l.logit));
    const exps = logits.map((l) => ({ label: l.label, e: Math.exp(l.logit - max) }));
    const total = exps.reduce((sum, x) => sum + x.e, 0);
    return {
      scores: exps.map((x) => ({ label: x.label, score: x.e / total })),
      latencyMs: now() - started,
      idle: best >= IDLE_DISTANCE,
    };
  }

  dispose(): void {
    this.templates = [];
  }
}
