import type { ModelPack } from './modelPack';

/**
 * Runs a trained model somewhere faster than the app's own JavaScript: on
 * phones the app's JavaScript has no JIT, so a forward pass takes about half a
 * second; the camera engine page (a WebView) runs the same code about 30 times
 * faster. See src/engine/EngineModelChannel.ts.
 */
export interface RemoteModel {
  /** False until it can take requests; the recognizer then runs the model itself. */
  readonly available: boolean;
  /** The pack to use for `forward`. */
  load(pack: ModelPack): void;
  /** Logits for one window of frames (feature spec v1, depth zeroed). */
  forward(frames: readonly Float32Array[]): Promise<Float64Array>;
}
