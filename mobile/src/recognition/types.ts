/**
 * Recognition interfaces. The UI depends only on these, so a simulated,
 * on-device or remote recognizer can be swapped without touching screens.
 * See docs/architecture.md §6.
 */

import type { ModelStabilizerSettings } from '@/model/modelPack';
import type { RemoteModel } from '@/model/remote';

/** Label a model uses for "none of the known signs". Never shown as text. */
export const UNKNOWN_LABEL = '__unknown__';

/**
 * One camera frame reduced to landmarks (feature contract v1, see
 * shared/feature_spec_v1.json). `values` is null when nobody was detected.
 */
export interface LandmarkFrame {
  timestampMs: number;
  values: Float32Array | null;
}

/** Produces landmark frames, e.g. from the camera. */
export interface FrameSource {
  /** True when frames do not come from a real camera. */
  readonly simulated: boolean;
  /** Where a trained model can run faster than in the app (the camera engine page). */
  readonly model?: RemoteModel;
  start(onFrame: (frame: LandmarkFrame) => void): void;
  stop(): void;
}

export interface ScoredLabel {
  label: string;
  /** Probability-like score in [0, 1]. */
  score: number;
}

export interface RawPrediction {
  scores: ScoredLabel[];
  latencyMs: number;
  /**
   * Nothing sign-like in the window (e.g. hands resting). Not a failed attempt,
   * so it never leads to "not sure".
   */
  idle?: boolean;
  /**
   * A sign the person taught, whose own recordings clearly match this attempt
   * (PersonalizedRecognizer). The stabilizer shows it at a lower confidence.
   */
  confirmed?: string;
}

export type RecognizerKind = 'unavailable' | 'simulated' | 'on_device' | 'remote';

export interface RecognizerInfo {
  id: string;
  kind: RecognizerKind;
  version: string;
  labels: readonly string[];
  /**
   * True only if scores were calibrated on held-out signers (see
   * docs/model-evaluation.md). Confidence bands are hidden otherwise.
   */
  calibrated: boolean;
  /** Feature contract version the model expects; null if it reads no features. */
  featureSpecVersion: number | null;
  /**
   * Frames per prediction window; with `windowMs`, the minimum number of
   * frames before the first prediction.
   */
  windowSize: number;
  /**
   * Optional time-based window: keep the frames of the last `windowMs`
   * milliseconds, however many that is, so slow phones are not left waiting.
   */
  windowMs?: number;
  /** When to show a sign, tuned for this recognizer; the app's defaults otherwise. */
  stabilizer?: ModelStabilizerSettings | null;
  /** `segment`: recognizes whole signs once they are finished (see RecognitionSession). */
  mode?: 'window' | 'segment';
}

export interface SignRecognizer {
  readonly info: RecognizerInfo;
  /** Throws RecognizerUnavailableError when no usable model is installed. */
  load(): Promise<void>;
  predict(window: readonly LandmarkFrame[]): Promise<RawPrediction>;
  dispose(): void;
}

export class RecognizerUnavailableError extends Error {
  constructor(message = 'No sign recognition model is installed') {
    super(message);
    this.name = 'RecognizerUnavailableError';
  }
}

export type ConfidenceBand = 'high' | 'medium';

export type UncertainReason = 'low_confidence' | 'ambiguous' | 'unknown_sign' | 'unstable';

export interface Recognition {
  label: string;
  /** Chosen by the user from the suggestions, rather than recognized on its own. */
  chosen?: boolean;
  /** Chosen to replace the sign shown just before (it was not the one made). */
  corrects?: boolean;
  /** Null when the recognizer is not calibrated: never show a number or band then. */
  band: ConfidenceBand | null;
  timestampMs: number;
}

/**
 * What the user should be told right now.
 * - `no_signer`: nobody (no upper body) detected
 * - `no_hands`: a person is in view but no hands (only for recognizers that read hands)
 * - `analyzing`: watching; not enough evidence yet
 * - `uncertain`: activity without a trustworthy result ("please repeat")
 * - `recognized`: a stable, confident result (see `recognition`)
 */
export type RecognitionStatus = 'no_signer' | 'no_hands' | 'analyzing' | 'uncertain' | 'recognized';

export interface StabilizerStep {
  status: RecognitionStatus;
  reason?: UncertainReason;
  recognition?: Recognition;
  /**
   * Segment mode, to choose from: when not sure, the likeliest signs; after a
   * sign is shown, the next likeliest, in case it was not the one made.
   */
  suggestions?: string[];
}
