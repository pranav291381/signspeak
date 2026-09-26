/**
 * Recognition interfaces. The UI depends only on these, so a simulated,
 * on-device or remote recognizer can be swapped without touching screens.
 * See docs/architecture.md §6.
 */

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
  /** Frames per prediction window. */
  windowSize: number;
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
}
