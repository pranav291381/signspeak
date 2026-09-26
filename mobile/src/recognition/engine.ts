import { getSign, isEmergencySign } from '@/content/library';
import { PersonalSignRecognizer } from '@/personal/PersonalSignRecognizer';
import type { PersonalSign } from '@/personal/types';

import { MockSignRecognizer } from './recognizers/MockSignRecognizer';
import { UnavailableRecognizer } from './recognizers/UnavailableRecognizer';
import { RecognitionSession } from './session';
import { NoFrameSource, SimulatedFrameSource } from './sources';
import { PredictionStabilizer } from './stabilizer';
import type { FrameSource } from './types';

export interface EngineOptions {
  demoMode: boolean;
  /** Signs taught on this phone with enough recordings to be recognized. */
  signs?: readonly PersonalSign[];
  /** Live landmark frames from the camera engine. */
  source?: FrameSource | null;
}

export type SessionFactory = (options: EngineOptions) => RecognitionSession;

/** Personal signs taught for an emergency library concept get the stricter thresholds. */
export function isEmergencyLabel(label: string): boolean {
  const libraryId = label.startsWith('library:') ? label.slice('library:'.length) : label;
  return isEmergencySign(libraryId);
}

/**
 * Chooses the recognizer:
 * - demo mode: simulated results, clearly labelled as such;
 * - otherwise the signs taught on this phone, fed by live camera landmarks;
 * - with no taught signs, a session that reports `model_unavailable`.
 * A trained on-device model would be added here (docs/architecture.md §6.2).
 */
export const createRecognitionSession: SessionFactory = ({ demoMode, signs = [], source = null }) => {
  if (demoMode) {
    const recognizer = new MockSignRecognizer();
    return new RecognitionSession({
      source: new SimulatedFrameSource(),
      recognizer,
      stabilizer: new PredictionStabilizer({ isEmergency: isEmergencySign, calibrated: recognizer.info.calibrated }),
    });
  }
  if (signs.length > 0 && source) {
    const recognizer = new PersonalSignRecognizer(signs);
    return new RecognitionSession({
      source,
      recognizer,
      stabilizer: new PredictionStabilizer({ isEmergency: isEmergencyLabel, calibrated: false }),
      config: { stride: 3, requireHands: true },
    });
  }
  return new RecognitionSession({ source: new NoFrameSource(), recognizer: new UnavailableRecognizer() });
};

/** Only labels that exist in the sign library can be shown as text. */
export function isDisplayableLabel(label: string): boolean {
  return getSign(label) !== undefined;
}
