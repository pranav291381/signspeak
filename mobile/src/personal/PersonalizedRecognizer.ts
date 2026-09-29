import { UNKNOWN_LABEL, type LandmarkFrame, type RawPrediction, type RecognizerInfo, type SignRecognizer } from '@/recognition/types';

import { buildReferenceTemplates, prepareQuery, relativeDistance, type ReferenceSign, type SignTemplate } from './matcher';
import { PrefilterIndex } from './prefilter';
import { PREFILTER_CANDIDATES, PREFILTER_FROM, REFERENCE_WINDOW_MS } from './ReferenceSignRecognizer';
import { resampleByTime } from './sample';

/** As ReferenceSignRecognizer: softmax over −SHARPNESS × relative distance, "unknown" at 1. */
const SHARPNESS = 6;

/**
 * A trained model together with the signs taught on this phone. Each sign is
 * matched against the person's own recordings (subsequence DTW, as
 * ReferenceSignRecognizer); how clearly one of them matches decides how much
 * that match counts against the model:
 *
 *   score(sign) = (1 − w) · model(sign) + personal(sign),   w = 1 − personal(unknown)
 *
 * A clear match to the person's own recording (well inside its acceptance
 * distance) outweighs the model; no match leaves the model's answer as it was.
 * A sign of the model's vocabulary taught under its own label (`include:teacher`)
 * adds to the model's score for it; other taught signs (own words, letters) can
 * only come from the person's recordings.
 */
export class PersonalizedRecognizer implements SignRecognizer {
  readonly info: RecognizerInfo;
  private templates: SignTemplate[] = [];
  private index: PrefilterIndex | null = null;

  constructor(
    private readonly model: SignRecognizer,
    private readonly references: readonly ReferenceSign[],
  ) {
    const labels = [...model.info.labels];
    for (const r of references) if (!labels.includes(r.id)) labels.push(r.id);
    // The mixed scores are not calibrated, whatever the model's are.
    this.info = { ...model.info, id: `${model.info.id}+personal`, labels, calibrated: false };
  }

  async load(): Promise<void> {
    await this.model.load();
    // Taught signs that cannot be read are skipped: the model still works without them.
    this.templates = buildReferenceTemplates(this.references);
    this.index = this.templates.length >= PREFILTER_FROM ? new PrefilterIndex(this.templates) : null;
  }

  async predict(window: readonly LandmarkFrame[]): Promise<RawPrediction> {
    const prediction = await this.model.predict(window);
    if (prediction.idle || this.templates.length === 0) return prediction;
    const personal = this.match(window);
    if (!personal) return prediction;
    const weight = 1 - (personal.get(UNKNOWN_LABEL) ?? 1);
    const scores = new Map<string, number>();
    for (const s of prediction.scores) scores.set(s.label, (1 - weight) * s.score);
    for (const [label, score] of personal) {
      if (label !== UNKNOWN_LABEL) scores.set(label, (scores.get(label) ?? 0) + score);
    }
    return { ...prediction, scores: [...scores].map(([label, score]) => ({ label, score })) };
  }

  dispose(): void {
    this.model.dispose();
    this.templates = [];
    this.index = null;
  }

  /** Scores of the taught signs and "unknown" for the frames, or null if no hands were raised. */
  private match(window: readonly LandmarkFrame[]): Map<string, number> | null {
    const end = window.at(-1)?.timestampMs ?? 0;
    // A whole sign (segment packs) is matched as it is; a continuous window, over its last few seconds.
    const start = this.model.info.mode === 'segment' ? (window[0]?.timestampMs ?? end) : end - REFERENCE_WINDOW_MS;
    const query = prepareQuery(resampleByTime(window, start, end));
    if (!query) return null;
    const compared = this.index ? this.index.candidates(query, PREFILTER_CANDIDATES) : this.templates;
    const logits = [...compared.map((t) => ({ label: t.signId, logit: -SHARPNESS * relativeDistance(t, query) })), { label: UNKNOWN_LABEL, logit: -SHARPNESS }];
    const max = Math.max(...logits.map((l) => l.logit));
    const exps = logits.map((l) => ({ label: l.label, e: Math.exp(l.logit - max) }));
    const total = exps.reduce((sum, x) => sum + x.e, 0);
    return new Map(exps.map((x) => [x.label, x.e / total]));
  }
}
