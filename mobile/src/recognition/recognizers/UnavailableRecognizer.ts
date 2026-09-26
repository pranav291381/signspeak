import { RecognizerUnavailableError, type RawPrediction, type RecognizerInfo, type SignRecognizer } from '../types';

/**
 * The default recognizer while no trained model exists. It reports that
 * recognition is unavailable instead of pretending to work.
 */
export class UnavailableRecognizer implements SignRecognizer {
  readonly info: RecognizerInfo = {
    id: 'none',
    kind: 'unavailable',
    version: '0',
    labels: [],
    calibrated: false,
    featureSpecVersion: null,
    windowSize: 1,
  };

  async load(): Promise<void> {
    throw new RecognizerUnavailableError();
  }

  async predict(): Promise<RawPrediction> {
    throw new RecognizerUnavailableError();
  }

  dispose(): void {}
}
