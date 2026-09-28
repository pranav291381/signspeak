/**
 * The sign model inside the engine page. The page's JavaScript runs with a
 * JIT (WebView, browser), so a forward pass takes milliseconds here instead of
 * about half a second in the app's JavaScript on phones. The app sends the
 * model pack once and then one window per prediction
 * (src/engine/EngineModelChannel.ts).
 */
import type { EngineToHost, HostToEngine } from '../src/engine/protocol';
import { parseModelPack } from '../src/model/modelPack';
import { SignModel } from '../src/model/signModel';
import { decodeSpecFrames, XY_FRAME_DIM } from '../src/personal/codec';

export type ModelMessage = Extract<HostToEngine, { type: 'setModel' | 'predict' }>;

export class EngineSignModel {
  private model: SignModel | null = null;
  /** The last pack could not be read. */
  private broken = false;

  /** Handles a model message; returns the reply to send, if any. */
  handle(message: ModelMessage): EngineToHost | null {
    if (message.type === 'setModel') {
      this.model = null;
      this.broken = false;
      if (message.pack !== null) {
        try {
          this.model = new SignModel(parseModelPack(JSON.parse(message.pack)));
        } catch {
          this.broken = true;
        }
      }
      return null;
    }
    const { id } = message;
    if (!this.model) return { type: 'prediction', id, logits: null, error: this.broken ? 'failed' : 'no_model' };
    try {
      const frames = decodeSpecFrames(message.data, message.frames, XY_FRAME_DIM);
      return { type: 'prediction', id, logits: Array.from(this.model.forward(frames)) };
    } catch {
      return { type: 'prediction', id, logits: null, error: 'failed' };
    }
  }
}
