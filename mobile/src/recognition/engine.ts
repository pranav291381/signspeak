import { getSign, isEmergencySign } from '@/content/library';
import type { ModelPack } from '@/model/modelPack';
import { ModelSignRecognizer } from '@/model/ModelSignRecognizer';
import { personalReferences, type ReferenceSign } from '@/personal/matcher';
import { PersonalizedRecognizer } from '@/personal/PersonalizedRecognizer';
import { PersonalSignRecognizer } from '@/personal/PersonalSignRecognizer';
import { ReferenceSignRecognizer } from '@/personal/ReferenceSignRecognizer';
import type { PersonalSign } from '@/personal/types';

import { MockSignRecognizer } from './recognizers/MockSignRecognizer';
import { UnavailableRecognizer } from './recognizers/UnavailableRecognizer';
import { DEFAULT_STABILIZER_CONFIG, type SessionConfig, type StabilizerConfig } from './config';
import { RecognitionSession } from './session';
import { NoFrameSource, SimulatedFrameSource } from './sources';
import { PredictionStabilizer } from './stabilizer';
import type { FrameSource, RecognizerInfo, SignRecognizer } from './types';

export interface EngineOptions {
  demoMode: boolean;
  /** Signs taught on this phone with enough recordings to be recognized. */
  signs?: readonly PersonalSign[];
  /** Signs of the installed sign packs (the dictionary vocabulary). Used instead of `signs`. */
  vocabulary?: readonly ReferenceSign[];
  /** An installed trained model. Used instead of `vocabulary`, and together with `signs`. */
  model?: ModelPack | null;
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
 * Session for recorded reference signs, fed by live camera landmarks. Also used
 * by the sign pack accuracy test (engine/extract.ts), so it measures exactly
 * what the app does.
 */
export function referenceSession(recognizer: SignRecognizer, source: FrameSource): RecognitionSession {
  return new RecognitionSession({
    source,
    recognizer,
    stabilizer: new PredictionStabilizer({
      isEmergency: isEmergencyLabel,
      calibrated: false,
      // Predictions start early (time-based window), so a sign in progress
      // briefly matches nothing; wait ~2.4 s before saying "not sure".
      config: { uncertainAfterPredictions: 12 },
    }),
    config: { stride: 3, requireHands: true },
  });
}

/**
 * Stabilizer settings for a recognizer: its tuned thresholds if it has them
 * (emergency signs stay at least as strict as the defaults), else the defaults.
 */
export function stabilizerConfigFor(info: RecognizerInfo): Partial<StabilizerConfig> | undefined {
  const tuned = info.stabilizer;
  if (!tuned) return undefined;
  return {
    ...tuned,
    emergencyMinConfidence: Math.max(DEFAULT_STABILIZER_CONFIG.emergencyMinConfidence, tuned.minConfidence),
    emergencyMinStablePredictions: Math.max(DEFAULT_STABILIZER_CONFIG.emergencyMinStablePredictions, tuned.minStablePredictions),
  };
}

/**
 * Session for a trained model: a fixed window of frames, the model's tuned
 * stabilizer settings or the defaults (with confidence bands only if the
 * model's calibration was verified). Also used by the model accuracy test
 * (engine/extract.ts).
 */
export function modelSession(recognizer: SignRecognizer, source: FrameSource): RecognitionSession {
  return new RecognitionSession({
    source,
    recognizer,
    stabilizer: new PredictionStabilizer({
      isEmergency: isEmergencyLabel,
      calibrated: recognizer.info.calibrated,
      config: stabilizerConfigFor(recognizer.info),
    }),
    config: modelSessionConfig(recognizer.info),
  });
}

/** Session settings for a trained model (also used by scripts/lib/tune-model.ts). */
export function modelSessionConfig(info: RecognizerInfo): Partial<SessionConfig> {
  return { stride: 2, requireHands: true, mode: info.mode ?? 'window' };
}

/**
 * Chooses the recognizer:
 * - demo mode: simulated results, clearly labelled as such;
 * - otherwise an installed trained model (with the signs taught on this phone,
 *   if any), the installed sign vocabulary (sign packs), or the signs taught on
 *   this phone alone, fed by live camera landmarks;
 * - with neither, a session that reports `model_unavailable`.
 */
export const createRecognitionSession: SessionFactory = ({ demoMode, signs = [], vocabulary = [], model = null, source = null }) => {
  if (demoMode) {
    const recognizer = new MockSignRecognizer();
    return new RecognitionSession({
      source: new SimulatedFrameSource(),
      recognizer,
      stabilizer: new PredictionStabilizer({ isEmergency: isEmergencySign, calibrated: recognizer.info.calibrated }),
    });
  }
  if (model && source) {
    const recognizer = new ModelSignRecognizer(model, source.model);
    const taught = personalReferences(signs);
    return modelSession(taught.length > 0 ? new PersonalizedRecognizer(recognizer, taught) : recognizer, source);
  }
  if (vocabulary.length > 0 && source) {
    const recognizer = new ReferenceSignRecognizer(vocabulary, { id: 'sign-pack-dtw', version: '1', emptyMessage: 'No usable signs in the sign packs' });
    return referenceSession(recognizer, source);
  }
  if (signs.length > 0 && source) {
    return referenceSession(new PersonalSignRecognizer(signs), source);
  }
  return new RecognitionSession({ source: new NoFrameSource(), recognizer: new UnavailableRecognizer() });
};

/** Only labels that exist in the sign library can be shown as text. */
export function isDisplayableLabel(label: string): boolean {
  return getSign(label) !== undefined;
}
