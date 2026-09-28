/**
 * Web worker of the engine page: runs the sign model on its own thread, so
 * hand and pose tracking on the page's main thread are not held up by it.
 * Bundled by scripts/build-engine.mjs and started from a blob: URL; it gets
 * the same `setModel` / `predict` messages as EngineSignModel and replies
 * with `prediction` messages.
 */
import { EngineSignModel, type ModelMessage } from './model';

const scope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<ModelMessage>) => void): void;
  postMessage(message: unknown): void;
};
const model = new EngineSignModel();

scope.addEventListener('message', (event) => {
  const reply = model.handle(event.data);
  if (reply) scope.postMessage(reply);
});
