import manifest from './mediapipeAssets.json';
import type { EngineAssetSource } from './protocol';

/** Files hosted by MediaPipe's own CDN locations (pinned versions). */
export function remoteSource(): EngineAssetSource {
  return {
    wasmBase: manifest.remoteWasmBase,
    handModelUrl: manifest.models.hand.url,
    handLiteModelUrl: manifest.models.handLite.url,
    poseModelUrl: manifest.models.pose.url,
  };
}

/** Files served by the web build itself from public/mediapipe (see scripts/setup-mediapipe-assets.mjs). */
export function sameOriginSource(origin: string): EngineAssetSource {
  const base = `${origin.replace(/\/+$/, '')}/mediapipe/`;
  return {
    wasmBase: `${base}wasm/`,
    handModelUrl: base + manifest.models.hand.file,
    handLiteModelUrl: base + manifest.models.handLite.file,
    poseModelUrl: base + manifest.models.pose.file,
  };
}

/**
 * Optional self-hosted mirror (e.g. an NGO server on a local network), set at
 * build time. It must contain the same files: wasm/…, hand_landmarker.task,
 * hand_landmark_lite.tflite, pose_landmarker_lite.task. Integrity is still
 * checked against pinned hashes.
 */
export function customSource(): EngineAssetSource | null {
  const base = process.env.EXPO_PUBLIC_MEDIAPIPE_BASE_URL?.trim();
  return base ? sameOriginSource(base) : null;
}

export function engineAssetSources(platform: string, origin?: string): EngineAssetSource[] {
  const sources: EngineAssetSource[] = [];
  const custom = customSource();
  if (custom) sources.push(custom);
  if (platform === 'web' && origin) sources.push(sameOriginSource(origin));
  sources.push(remoteSource());
  return sources;
}

/** Expected SHA-256 by role: WASM file name, or the model's role (so swapped files are rejected too). */
export function engineHashes(): Record<string, string> {
  return {
    ...manifest.wasm,
    [HAND_MODEL_KEY]: manifest.models.hand.sha256,
    [HAND_LITE_MODEL_KEY]: manifest.models.handLite.sha256,
    [HAND_LITE_BUNDLE_KEY]: manifest.derived.handLiteBundle.sha256,
    [POSE_MODEL_KEY]: manifest.models.pose.sha256,
  };
}

export const HAND_MODEL_KEY = 'model:hand';
export const POSE_MODEL_KEY = 'model:pose';
/** MediaPipe's lite hand landmark model (legacy format) and the Tasks bundle the engine makes from it. */
export const HAND_LITE_MODEL_KEY = 'model:hand-lite';
export const HAND_LITE_BUNDLE_KEY = 'bundle:hand-lite';
