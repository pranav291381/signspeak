import type { StyleProp, ViewStyle } from 'react-native';

import type { EnginePrediction } from './EngineModelChannel';
import type { EngineErrorCode, EngineFacing, EngineStatus, HostToEngine } from './protocol';

export interface EngineHandlers {
  /** A processed frame: feature spec v1 values, or null when nobody is in view. */
  onFrame?: (timestampMs: number, values: number[] | null, hands: number) => void;
  onStatus?: (status: EngineStatus, progress?: number) => void;
  onError?: (code: EngineErrorCode) => void;
  onStats?: (fps: number, inferenceMs: number, delegate?: 'GPU' | 'CPU', note?: string) => void;
  onPrediction?: (message: EnginePrediction) => void;
}

/** Something that talks to the engine page once it is loaded (EngineModelChannel). */
export interface EngineLink {
  attach(send: (message: HostToEngine) => void): void;
  detach(): void;
  receive(message: EnginePrediction): void;
}

export interface LandmarkCameraProps extends EngineHandlers {
  facing: EngineFacing;
  /** False releases the camera and stops tracking (battery, privacy). */
  active: boolean;
  /** Increment to briefly highlight the hand skeleton (e.g. a sign was recognized). */
  flashSignal?: number;
  /** Runs the sign model in the engine page (EngineFrameSource.model). */
  model?: EngineLink;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
