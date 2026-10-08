import { UNKNOWN_LABEL, type LandmarkFrame, type RawPrediction, type RecognizerInfo, type SignRecognizer } from '@/recognition/types';

import { decodeSpecFrames } from './codec';
import { buildReferenceTemplates, prepareQuery, relativeDistance, type ReferenceSign, type SignTemplate } from './matcher';
import { REFERENCE_WINDOW_MS } from './ReferenceSignRecognizer';
import { resampleByTime, SAMPLE_FPS } from './sample';

/**
 * How a sign the person taught moves the model's answer (chosen on validation
 * recordings, docs/architecture.md §6.6): for each of the model's TOP_K
 * likeliest signs that was taught,
 *
 *   log score += VIEW_WEIGHT · (similarity − VIEW_BASE) + DISTANCE_WEIGHT · (1 − min(distance, 2))
 *
 * - similarity: how alike the model sees this attempt and the person's takes
 *   (cosine of the model's centred log-probabilities, best take);
 * - distance: DTW distance of the hand and arm movement to the takes, relative
 *   to the sign's acceptance distance (≤ 1: a match; see matcher.ts).
 * Only signs the model itself finds plausible are moved, so a taught sign
 * cannot take over an unrelated one.
 */
const TOP_K = 5;
const VIEW_WEIGHT = 8;
const VIEW_BASE = 0.7;
const DISTANCE_WEIGHT = 2;
const MAX_DISTANCE = 2;
/**
 * A taught sign whose takes the model sees this alike (or closer) is confirmed
 * by the person's own recordings: see RawPrediction.confirmed. Chosen on
 * validation recordings; same session on the test ones, 78% → 82% right on the
 * first try, wrong 3.8% → 4.0%.
 */
const CONFIRMING_VIEW = 0.85;
/** Taught words the model does not know: softmax over −SHARPNESS × relative distance, "unknown" at 1 (as ReferenceSignRecognizer). */
const SHARPNESS = 6;

/** The model's view of a take, by model and take: computing it is a forward pass, so it is kept. */
const viewCache = new Map<string, Float64Array | null>();

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + text.length.toString(36);
}

/** Centred, unit-length log-probabilities: comparing them compares the model's logits. */
function view(scores: readonly number[]): Float64Array {
  const out = Float64Array.from(scores, (p) => Math.log(Math.max(p, 1e-300)));
  const mean = out.reduce((a, b) => a + b, 0) / out.length;
  let norm = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] = out[i]! - mean;
    norm += out[i]! * out[i]!;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / norm;
  return out;
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * A trained model together with the signs taught on this phone.
 *
 * - A taught sign of the model's vocabulary (stored under the model's own label,
 *   e.g. `include:teacher`) moves the model's score for it, as above.
 * - A taught word or letter the model does not know can only come from the
 *   person's recordings: a clear match to them outweighs the model (as
 *   PersonalSignRecognizer), no match leaves the model's answer as it was.
 */
export class PersonalizedRecognizer implements SignRecognizer {
  readonly info: RecognizerInfo;
  private readonly modelLabels: ReadonlySet<string>;
  private templates = new Map<string, SignTemplate>();
  /** Per taught vocabulary sign, the model's view of each take (filled in the background). */
  private views = new Map<string, Float64Array[]>();
  private disposed = false;
  /**
   * Resolves once the model's view of every taught take is known. Until then a
   * taught sign counts by its movement alone; recognition does not wait for it.
   */
  viewsReady: Promise<void> = Promise.resolve();

  constructor(
    private readonly model: SignRecognizer,
    private readonly references: readonly ReferenceSign[],
  ) {
    this.modelLabels = new Set(model.info.labels);
    const labels = [...model.info.labels];
    for (const r of references) if (!this.modelLabels.has(r.id)) labels.push(r.id);
    // The moved scores are not calibrated, whatever the model's are.
    this.info = { ...model.info, id: `${model.info.id}+personal`, labels, calibrated: false };
  }

  async load(): Promise<void> {
    await this.model.load();
    this.disposed = false;
    // Taught signs that cannot be read are skipped: the model still works without them.
    this.templates = new Map(buildReferenceTemplates(this.references).map((t) => [t.signId, t]));
    this.viewsReady = this.computeViews();
  }

  async predict(window: readonly LandmarkFrame[]): Promise<RawPrediction> {
    const prediction = await this.model.predict(window);
    if (prediction.idle || this.templates.size === 0) return prediction;
    const query = this.query(window);
    if (!query) return prediction;

    // Signs of the model's vocabulary the person taught, among the model's likeliest.
    const logits = new Map(prediction.scores.map((s) => [s.label, Math.log(Math.max(s.score, 1e-300))]));
    const ranked = [...prediction.scores].sort((a, b) => b.score - a.score).slice(0, TOP_K);
    const queryView = view(prediction.scores.map((s) => s.score));
    const similarity = new Map<string, number>();
    for (const { label } of ranked) {
      const template = this.templates.get(label);
      if (!template) continue;
      let bonus = DISTANCE_WEIGHT * (1 - Math.min(relativeDistance(template, query), MAX_DISTANCE));
      const takes = this.views.get(label);
      if (takes && takes.length > 0) {
        const alike = Math.max(...takes.map((t) => dot(queryView, t)));
        similarity.set(label, alike);
        bonus += VIEW_WEIGHT * (alike - VIEW_BASE);
      }
      logits.set(label, logits.get(label)! + bonus);
    }
    let scores = softmaxOf(logits);
    const best = [...scores].reduce((a, b) => (b[1] > a[1] ? b : a));
    const confirmed = (similarity.get(best[0]) ?? -1) >= CONFIRMING_VIEW ? best[0] : undefined;

    // Taught words and letters the model does not know.
    const own = [...this.templates.values()].filter((t) => !this.modelLabels.has(t.signId));
    if (own.length > 0) {
      const personal = softmaxOf(
        new Map([...own.map((t) => [t.signId, -SHARPNESS * relativeDistance(t, query)] as const), [UNKNOWN_LABEL, -SHARPNESS] as const]),
      );
      const weight = 1 - (personal.get(UNKNOWN_LABEL) ?? 1);
      scores = new Map([...scores].map(([label, score]) => [label, (1 - weight) * score]));
      for (const [label, score] of personal) if (label !== UNKNOWN_LABEL) scores.set(label, (scores.get(label) ?? 0) + score);
    }
    const top = [...scores].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    return {
      ...prediction,
      scores: [...scores].map(([label, score]) => ({ label, score })),
      // Only if the confirmed sign is still the likeliest once taught words are counted.
      ...(confirmed && confirmed === top ? { confirmed } : {}),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.model.dispose();
    this.templates = new Map();
    this.views = new Map();
  }

  /** The sign's frames as the matcher reads them: a whole sign as it is, a continuous window over its last seconds. */
  private query(window: readonly LandmarkFrame[]) {
    const end = window.at(-1)?.timestampMs ?? 0;
    const start = this.model.info.mode === 'segment' ? (window[0]?.timestampMs ?? end) : end - REFERENCE_WINDOW_MS;
    return prepareQuery(resampleByTime(window, start, end));
  }

  /** Runs the model once on each take of the taught vocabulary signs (kept across sessions). */
  private async computeViews(): Promise<void> {
    const version = `${this.model.info.id}@${this.model.info.version}`;
    for (const reference of this.references) {
      if (!this.modelLabels.has(reference.id)) continue;
      const takes: Float64Array[] = [];
      for (const sample of reference.samples) {
        if (this.disposed) return;
        const key = `${version}:${hash(sample.data)}`;
        if (!viewCache.has(key)) {
          let computed: Float64Array | null = null;
          try {
            const frames = decodeSpecFrames(sample.data, sample.frames, sample.dim);
            const prediction = await this.model.predict(frames.map((values, i) => ({ timestampMs: (i * 1000) / SAMPLE_FPS, values })));
            computed = prediction.idle ? null : view(prediction.scores.map((s) => s.score));
          } catch {
            computed = null;
          }
          viewCache.set(key, computed);
        }
        const cached = viewCache.get(key);
        if (cached) takes.push(cached);
      }
      if (this.disposed) return;
      this.views.set(reference.id, takes);
    }
  }
}

function softmaxOf(logits: ReadonlyMap<string, number>): Map<string, number> {
  const max = Math.max(...logits.values());
  const exps = [...logits].map(([label, logit]) => [label, Math.exp(logit - max)] as const);
  const total = exps.reduce((sum, [, e]) => sum + e, 0);
  return new Map(exps.map(([label, e]) => [label, e / total]));
}
