/**
 * Tracking worker: runs one MediaPipe landmarker (hands or pose) off the engine
 * page's main thread. Several run at once: pose and hands in parallel, and on
 * slow phones more than one hands worker, taking camera frames in turn.
 * Bundled by scripts/build-engine.mjs and started from a blob URL by engine.ts.
 */
import { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

import type { TrackerReply, TrackerRequest } from './trackerProtocol';

const scope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<TrackerRequest>) => void): void;
  postMessage(message: TrackerReply): void;
};

let hands: HandLandmarker | null = null;
let pose: PoseLandmarker | null = null;

const plain = (points: { x: number; y: number; z: number; visibility?: number }[][]) =>
  points.map((list) => list.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 })));

async function init(message: Extract<TrackerRequest, { type: 'init' }>): Promise<void> {
  const fileset = { wasmLoaderPath: message.wasmLoaderPath, wasmBinaryPath: message.wasmBinaryPath };
  const baseOptions = { modelAssetBuffer: message.model, delegate: message.delegate };
  if (message.role === 'hands') {
    hands = await HandLandmarker.createFromOptions(fileset, {
      baseOptions,
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } else {
    pose = await PoseLandmarker.createFromOptions(fileset, { baseOptions, runningMode: 'VIDEO', numPoses: 1 });
  }
}

scope.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'init') {
    init(message).then(
      () => scope.postMessage({ type: 'ready' }),
      (error: unknown) => scope.postMessage({ type: 'failed', message: String(error instanceof Error ? error.message : error).slice(0, 300) }),
    );
    return;
  }
  if (message.type === 'close') {
    hands?.close();
    pose?.close();
    return;
  }
  const started = performance.now();
  try {
    if (hands) {
      const result = hands.detectForVideo(message.bitmap, message.timestamp);
      scope.postMessage({
        type: 'hands',
        id: message.id,
        ms: performance.now() - started,
        landmarks: plain(result.landmarks),
        handedness: result.handedness.map((list) => list.map((c) => ({ categoryName: c.categoryName, score: c.score }))),
      });
    } else if (pose) {
      const result = pose.detectForVideo(message.bitmap, message.timestamp);
      scope.postMessage({ type: 'pose', id: message.id, ms: performance.now() - started, landmarks: plain(result.landmarks)[0] ?? null });
    }
  } catch (error) {
    scope.postMessage({ type: 'failed', message: String(error instanceof Error ? error.message : error).slice(0, 300) });
  } finally {
    message.bitmap.close();
  }
});
