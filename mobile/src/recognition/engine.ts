import { getSign, isEmergencySign } from '@/content/library';

import { MockSignRecognizer } from './recognizers/MockSignRecognizer';
import { UnavailableRecognizer } from './recognizers/UnavailableRecognizer';
import { RecognitionSession } from './session';
import { NoFrameSource, SimulatedFrameSource } from './sources';
import { PredictionStabilizer } from './stabilizer';

export interface EngineOptions {
  demoMode: boolean;
}

export type SessionFactory = (options: EngineOptions) => RecognitionSession;

/**
 * Chooses the recognizer for the current configuration.
 *
 * Today there is no trained model, so outside demo mode this returns a session
 * that reports `model_unavailable`. When an on-device model pack exists, this is
 * the only place that needs to change (see docs/architecture.md §6.2).
 */
export const createRecognitionSession: SessionFactory = ({ demoMode }) => {
  const recognizer = demoMode ? new MockSignRecognizer() : new UnavailableRecognizer();
  const source = demoMode ? new SimulatedFrameSource() : new NoFrameSource();
  const stabilizer = new PredictionStabilizer({
    isEmergency: isEmergencySign,
    calibrated: recognizer.info.calibrated,
  });
  return new RecognitionSession({ source, recognizer, stabilizer });
};

/** Only labels that exist in the sign library can be shown as text. */
export function isDisplayableLabel(label: string): boolean {
  return getSign(label) !== undefined;
}
