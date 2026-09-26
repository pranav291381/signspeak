/**
 * Messages between the app and the landmark engine page (engine/engine.ts),
 * which runs MediaPipe inside a WebView on phones and an <iframe> on the web.
 * Only numbers leave the engine: camera images never do.
 */

export const ENGINE_MESSAGE_TAG = 'isl-engine';

export type EngineFacing = 'front' | 'back';

export interface EngineAssetSource {
  /** Folder containing the MediaPipe WASM loader + binary (trailing slash). */
  wasmBase: string;
  handModelUrl: string;
  poseModelUrl: string;
}

export interface EngineConfig {
  facing: EngineFacing;
  active: boolean;
  targetFps: number;
  /** Tried in order until one loads and passes the integrity check. */
  sources: EngineAssetSource[];
  /** SHA-256 (hex) pinned at build time: WASM by file name, models as 'model:hand' / 'model:pose'. */
  hashes: Record<string, string>;
  /** Draw the tracked hand skeleton and arms over the preview. */
  showLandmarks: boolean;
  /** No motion trails or flashes (system "reduce motion" setting). */
  reduceMotion: boolean;
}

export type EngineStatus = 'loading' | 'downloading' | 'starting_camera' | 'running' | 'paused';

export type EngineErrorCode =
  | 'camera_denied'
  | 'no_camera'
  | 'camera_in_use'
  | 'insecure_context'
  | 'unsupported'
  | 'model_load_failed'
  | 'integrity_failed';

export type EngineToHost =
  | { type: 'status'; status: EngineStatus; progress?: number }
  | { type: 'error'; code: EngineErrorCode; detail?: string }
  /** One processed camera frame: feature spec v1 values, or null when nobody is in view. */
  | { type: 'frame'; t: number; v: number[] | null; hands: number }
  | { type: 'stats'; fps: number; inferenceMs: number };

export type HostToEngine =
  | { type: 'setActive'; active: boolean }
  | { type: 'setFacing'; facing: EngineFacing }
  /** Briefly highlight the skeleton, e.g. when a sign was recognized. */
  | { type: 'flash' }
  | { type: 'setReduceMotion'; reduceMotion: boolean };

export interface TaggedMessage<T> {
  tag: typeof ENGINE_MESSAGE_TAG;
  payload: T;
}

export function encodeMessage<T>(payload: T): string {
  return JSON.stringify({ tag: ENGINE_MESSAGE_TAG, payload } satisfies TaggedMessage<T>);
}

/** Parse a message from the other side; returns null for anything that is not ours. */
export function decodeEngineMessage(data: unknown): EngineToHost | null {
  let parsed: unknown = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const message = parsed as Partial<TaggedMessage<EngineToHost>>;
  if (message.tag !== ENGINE_MESSAGE_TAG || !message.payload || typeof message.payload !== 'object') return null;
  const payload = message.payload as { type?: unknown };
  return ['status', 'error', 'frame', 'stats'].includes(String(payload.type)) ? (message.payload as EngineToHost) : null;
}

export function decodeHostMessage(data: unknown): HostToEngine | null {
  let parsed: unknown = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const message = parsed as Partial<TaggedMessage<HostToEngine>>;
  if (message.tag !== ENGINE_MESSAGE_TAG || !message.payload) return null;
  const payload = message.payload;
  if (payload.type === 'setActive' && typeof payload.active === 'boolean') return payload;
  if (payload.type === 'setFacing' && (payload.facing === 'front' || payload.facing === 'back')) return payload;
  if (payload.type === 'flash') return { type: 'flash' };
  if (payload.type === 'setReduceMotion' && typeof payload.reduceMotion === 'boolean') {
    return { type: 'setReduceMotion', reduceMotion: payload.reduceMotion };
  }
  return null;
}
