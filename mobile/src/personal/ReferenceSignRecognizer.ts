import {
  RecognizerUnavailableError,
  UNKNOWN_LABEL,
  type LandmarkFrame,
  type RawPrediction,
  type RecognizerInfo,
  type SignRecognizer,
} from '@/recognition/types';

import { buildReferenceTemplates, prepareQuery, relativeDistance, type ReferenceSign, type SignTemplate } from './matcher';
import { PrefilterIndex } from './prefilter';
import { resampleByTime } from './sample';

/** Recent time that is matched: long enough for one sign with its lead-in. */
export const REFERENCE_WINDOW_MS = 3000;
/** Frames needed before the first prediction (≈ 0.5 s at 15 fps). */
export const REFERENCE_MIN_FRAMES = 8;
/**
 * Scores are a softmax over −SHARPNESS × relative distance, with "unknown" at
 * relative distance 1. A sign well inside its acceptance distance scores high;
 * two similar signs share the score, so the stabilizer's margin rule rejects them.
 */
const SHARPNESS = 6;
/** Beyond this relative distance nothing sign-like is happening (e.g. resting hands). */
const IDLE_DISTANCE = 2;
/** From this many signs, a coarse first pass picks the signs worth a full comparison. */
export const PREFILTER_FROM = 48;
/** Signs given a full comparison after the first pass. */
export const PREFILTER_CANDIDATES = 24;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface ReferenceRecognizerOptions {
  id: string;
  version: string;
  /** Message of the error thrown by load() when no sign can be used. */
  emptyMessage: string;
  /** Known labels, if more than the references (e.g. signs still being recorded). */
  labels?: readonly string[];
}

/**
 * Recognizes a fixed set of recorded signs (taught on this phone, or a
 * dictionary sign pack). It only knows those signs, and says so ("unknown")
 * for anything else instead of guessing.
 */
export class ReferenceSignRecognizer implements SignRecognizer {
  readonly info: RecognizerInfo;
  private templates: SignTemplate[] = [];
  private index: PrefilterIndex | null = null;

  constructor(
    private readonly references: readonly ReferenceSign[],
    private readonly options: ReferenceRecognizerOptions = { id: 'reference-dtw', version: '1', emptyMessage: 'No signs to recognize' },
  ) {
    this.info = {
      id: options.id,
      kind: 'on_device',
      version: options.version,
      labels: options.labels ?? references.map((s) => s.id),
      calibrated: false,
      featureSpecVersion: 1,
      windowSize: REFERENCE_MIN_FRAMES,
      windowMs: REFERENCE_WINDOW_MS,
    };
  }

  async load(): Promise<void> {
    this.templates = buildReferenceTemplates(this.references);
    if (this.templates.length === 0) throw new RecognizerUnavailableError(this.options.emptyMessage);
    this.index = this.templates.length >= PREFILTER_FROM ? new PrefilterIndex(this.templates) : null;
  }

  async predict(window: readonly LandmarkFrame[]): Promise<RawPrediction> {
    const started = now();
    const end = window.at(-1)?.timestampMs ?? 0;
    const query = prepareQuery(resampleByTime(window, end - REFERENCE_WINDOW_MS, end));
    if (!query) {
      return { scores: [{ label: UNKNOWN_LABEL, score: 1 }], latencyMs: now() - started, idle: true };
    }

    const compared = this.index ? this.index.candidates(query, PREFILTER_CANDIDATES) : this.templates;
    const distances = compared.map((t) => ({ label: t.signId, r: relativeDistance(t, query) }));
    const best = Math.min(Infinity, ...distances.map((d) => d.r));
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
    this.index = null;
  }
}
