import type { StyleProp, ViewStyle } from 'react-native';

import type { EngineErrorCode, EngineFacing, EngineStatus } from './protocol';

export interface EngineHandlers {
  /** A processed frame: feature spec v1 values, or null when nobody is in view. */
  onFrame?: (timestampMs: number, values: number[] | null, hands: number) => void;
  onStatus?: (status: EngineStatus, progress?: number) => void;
  onError?: (code: EngineErrorCode) => void;
  onStats?: (fps: number, inferenceMs: number, delegate?: 'GPU' | 'CPU') => void;
}

export interface LandmarkCameraProps extends EngineHandlers {
  facing: EngineFacing;
  /** False releases the camera and stops tracking (battery, privacy). */
  active: boolean;
  /** Increment to briefly highlight the hand skeleton (e.g. a sign was recognized). */
  flashSignal?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
