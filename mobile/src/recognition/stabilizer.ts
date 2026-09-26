import { DEFAULT_STABILIZER_CONFIG, validateStabilizerConfig, type StabilizerConfig } from './config';
import {
  UNKNOWN_LABEL,
  type RawPrediction,
  type Recognition,
  type ScoredLabel,
  type StabilizerStep,
  type UncertainReason,
} from './types';

export interface StabilizerOptions {
  config?: Partial<StabilizerConfig>;
  /** Emergency signs use stricter thresholds. */
  isEmergency?: (label: string) => boolean;
  /** Whether the recognizer's scores are calibrated; bands are hidden otherwise. */
  calibrated?: boolean;
}

function topLabel(scores: readonly ScoredLabel[]): ScoredLabel | undefined {
  let best: ScoredLabel | undefined;
  for (const s of scores) {
    if (!best || s.score > best.score) best = s;
  }
  return best;
}

/**
 * Turns noisy per-window predictions into results a person can trust.
 *
 * A sign is shown only when, for enough consecutive predictions, the smoothed
 * top score clears the confidence threshold, beats the runner-up by a margin,
 * and agrees with the raw prediction. Otherwise the user is told the app is
 * still watching, or, after sustained activity without a result, that it is
 * not sure. It never guesses.
 */
export class PredictionStabilizer {
  readonly config: StabilizerConfig;
  private readonly isEmergency: (label: string) => boolean;
  private readonly calibrated: boolean;

  private history: Map<string, number>[] = [];
  private streakLabel: string | null = null;
  private streak = 0;
  private lastEmission: { label: string; timestampMs: number } | null = null;
  /** True once the last emitted sign is no longer being held. */
  private released = true;
  private predictionsWithoutResult = 0;
  private recentReasons: UncertainReason[] = [];

  constructor(options: StabilizerOptions = {}) {
    this.config = { ...DEFAULT_STABILIZER_CONFIG, ...options.config };
    validateStabilizerConfig(this.config);
    this.isEmergency = options.isEmergency ?? (() => false);
    this.calibrated = options.calibrated ?? false;
  }

  /** Forget everything, e.g. after pause or clear. */
  reset(): void {
    this.history = [];
    this.streakLabel = null;
    this.streak = 0;
    this.lastEmission = null;
    this.released = true;
    this.predictionsWithoutResult = 0;
    this.recentReasons = [];
  }

  /**
   * @param prediction scores for the latest window, or null if no signer was detected.
   * @param timestampMs time of the window's last frame.
   */
  update(prediction: RawPrediction | null, timestampMs: number): StabilizerStep {
    if (prediction === null) {
      this.history = [];
      this.streakLabel = null;
      this.streak = 0;
      this.released = true;
      this.predictionsWithoutResult = 0;
      this.recentReasons = [];
      return { status: 'no_signer' };
    }

    const smoothed = this.smooth(prediction.scores);
    const [first, second] = smoothed;
    const rawTop = topLabel(prediction.scores);

    let candidate: string | null = null;
    let reason: UncertainReason | undefined;
    let required = this.config.minStablePredictions;

    if (!first || first.label === UNKNOWN_LABEL) {
      reason = 'unknown_sign';
    } else {
      const emergency = this.isEmergency(first.label);
      const minConfidence = emergency ? this.config.emergencyMinConfidence : this.config.minConfidence;
      required = emergency ? this.config.emergencyMinStablePredictions : this.config.minStablePredictions;
      if (first.score < minConfidence) {
        reason = 'low_confidence';
      } else if (first.score - (second?.score ?? 0) < this.config.minMargin) {
        reason = 'ambiguous';
      } else if (rawTop?.label !== first.label) {
        reason = 'unstable';
      } else {
        candidate = first.label;
      }
    }

    if (candidate === null) {
      this.streakLabel = null;
      this.streak = 0;
      this.released = true;
      return this.noResult(reason ?? 'unstable');
    }

    if (candidate === this.streakLabel) {
      this.streak += 1;
    } else {
      this.streakLabel = candidate;
      this.streak = 1;
    }
    if (candidate !== this.lastEmission?.label) {
      this.released = true;
    }

    if (this.streak < required) {
      // A growing streak is progress; a single agreeing prediction is not.
      return this.streak >= 2 ? { status: 'analyzing' } : this.noResult('unstable');
    }

    if (!this.mayEmit(candidate, timestampMs)) {
      // Still holding a sign that was already shown, or within cooldown.
      this.predictionsWithoutResult = 0;
      return { status: 'analyzing' };
    }

    const score = first?.score ?? 0;
    const recognition: Recognition = {
      label: candidate,
      band: this.calibrated ? (score >= this.config.highConfidenceThreshold ? 'high' : 'medium') : null,
      timestampMs,
    };
    this.lastEmission = { label: candidate, timestampMs };
    this.released = false;
    this.streak = 0;
    this.predictionsWithoutResult = 0;
    this.recentReasons = [];
    return { status: 'recognized', recognition };
  }

  private mayEmit(label: string, timestampMs: number): boolean {
    if (!this.lastEmission) return true;
    const elapsed = timestampMs - this.lastEmission.timestampMs;
    if (label === this.lastEmission.label) {
      return this.released && elapsed >= this.config.duplicateSuppressionMs;
    }
    return elapsed >= this.config.cooldownMs;
  }

  private noResult(reason: UncertainReason): StabilizerStep {
    this.predictionsWithoutResult += 1;
    this.recentReasons.push(reason);
    if (this.recentReasons.length > this.config.uncertainAfterPredictions) {
      this.recentReasons.shift();
    }
    if (this.predictionsWithoutResult >= this.config.uncertainAfterPredictions) {
      return { status: 'uncertain', reason: this.dominantReason() };
    }
    return { status: 'analyzing' };
  }

  private dominantReason(): UncertainReason {
    const counts = new Map<UncertainReason, number>();
    for (const r of this.recentReasons) counts.set(r, (counts.get(r) ?? 0) + 1);
    let best: UncertainReason = 'low_confidence';
    let bestCount = -1;
    for (const [r, n] of counts) {
      if (n > bestCount) {
        best = r;
        bestCount = n;
      }
    }
    return best;
  }

  /** Mean of the last `smoothingWindow` score vectors, highest first. */
  private smooth(scores: readonly ScoredLabel[]): ScoredLabel[] {
    const current = new Map<string, number>();
    for (const { label, score } of scores) {
      current.set(label, Math.min(1, Math.max(0, Number.isFinite(score) ? score : 0)));
    }
    this.history.push(current);
    if (this.history.length > this.config.smoothingWindow) {
      this.history.shift();
    }
    const sums = new Map<string, number>();
    for (const entry of this.history) {
      for (const [label, score] of entry) sums.set(label, (sums.get(label) ?? 0) + score);
    }
    const n = this.history.length;
    return [...sums.entries()]
      .map(([label, sum]) => ({ label, score: sum / n }))
      .sort((a, b) => b.score - a.score);
  }
}
