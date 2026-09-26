/**
 * Stabilization settings. Defaults are deliberately conservative: showing
 * "not sure" is better than showing a wrong sign. Tune only with evaluation
 * data from signers who were not in the training set (docs/model-evaluation.md).
 */
export interface StabilizerConfig {
  /** Number of recent predictions whose scores are averaged. */
  smoothingWindow: number;
  /** Smoothed top score must reach this. */
  minConfidence: number;
  /** Required gap between the top two smoothed scores. */
  minMargin: number;
  /**
   * "Minimum stable frames": consecutive prediction steps whose raw top label
   * agrees with the smoothed candidate before it is shown.
   */
  minStablePredictions: number;
  /** Stricter thresholds for signs tagged as emergency. */
  emergencyMinConfidence: number;
  emergencyMinStablePredictions: number;
  /** After showing a sign, wait this long before showing a different one. */
  cooldownMs: number;
  /** Do not repeat the same sign within this time, and only after it was released. */
  duplicateSuppressionMs: number;
  /** Prediction steps of activity without a result before telling the user "not sure". */
  uncertainAfterPredictions: number;
  /** Calibrated recognizers only: smoothed score at or above this is "high" confidence. */
  highConfidenceThreshold: number;
}

export const DEFAULT_STABILIZER_CONFIG: StabilizerConfig = {
  smoothingWindow: 5,
  minConfidence: 0.7,
  minMargin: 0.15,
  minStablePredictions: 4,
  emergencyMinConfidence: 0.85,
  emergencyMinStablePredictions: 6,
  cooldownMs: 1200,
  duplicateSuppressionMs: 2500,
  uncertainAfterPredictions: 8,
  highConfidenceThreshold: 0.9,
};

export interface SessionConfig {
  /** Run a prediction every `stride` frames once the window is full. */
  stride: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  stride: 4,
};

export function validateStabilizerConfig(config: StabilizerConfig): void {
  const inUnit = (n: number) => n >= 0 && n <= 1;
  const problems: string[] = [];
  if (!Number.isInteger(config.smoothingWindow) || config.smoothingWindow < 1) problems.push('smoothingWindow');
  if (!inUnit(config.minConfidence)) problems.push('minConfidence');
  if (!inUnit(config.minMargin)) problems.push('minMargin');
  if (!inUnit(config.emergencyMinConfidence) || config.emergencyMinConfidence < config.minConfidence) {
    problems.push('emergencyMinConfidence');
  }
  if (!Number.isInteger(config.minStablePredictions) || config.minStablePredictions < 1) {
    problems.push('minStablePredictions');
  }
  if (config.emergencyMinStablePredictions < config.minStablePredictions) problems.push('emergencyMinStablePredictions');
  if (config.cooldownMs < 0) problems.push('cooldownMs');
  if (config.duplicateSuppressionMs < 0) problems.push('duplicateSuppressionMs');
  if (config.uncertainAfterPredictions < 1) problems.push('uncertainAfterPredictions');
  if (!inUnit(config.highConfidenceThreshold)) problems.push('highConfidenceThreshold');
  if (problems.length > 0) {
    throw new Error(`Invalid stabilizer config: ${problems.join(', ')}`);
  }
}
