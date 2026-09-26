/**
 * Landmark engine page: camera → MediaPipe hands + pose → feature spec v1 frames.
 *
 * Bundled by scripts/build-engine.mjs into a single HTML string and loaded in a
 * WebView (phones, origin https://localhost) or an <iframe> (web). Camera images
 * stay inside this page; only landmark numbers are posted to the app.
 *
 * MediaPipe files are downloaded once from the configured sources, checked
 * against SHA-256 hashes pinned at build time, and kept in Cache Storage so the
 * engine works offline afterwards.
 */
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

import {
  decodeHostMessage,
  encodeMessage,
  type EngineConfig,
  type EngineErrorCode,
  type EngineFacing,
  type EngineToHost,
  type HostToEngine,
} from '../src/engine/protocol';
import { cameraErrorCode, FrameMeter, frameValues, wasmFiles, type HandsResultLike } from './core';

declare global {
  interface Window {
    __ISL_ENGINE_CONFIG__?: EngineConfig;
    ReactNativeWebView?: { postMessage(message: string): void };
    __islEngine?: { receive(message: unknown): void };
  }
}

const CACHE_NAME = 'islconnect-mediapipe-v1';

class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

function send(message: EngineToHost): void {
  const data = encodeMessage(message);
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(data);
  } else if (window.parent !== window) {
    window.parent.postMessage(data, '*');
  }
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function openCache(): Promise<Cache | null> {
  try {
    return 'caches' in window ? await caches.open(CACHE_NAME) : null;
  } catch {
    return null;
  }
}

/** Cache-first download with integrity check. */
async function fetchVerified(url: string, expected: string | undefined, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const cache = await openCache();
  const verify = async (buffer: ArrayBuffer) =>
    !expected || toHex(await crypto.subtle.digest('SHA-256', buffer)) === expected;

  const cached = await cache?.match(url);
  if (cached) {
    const buffer = await cached.arrayBuffer();
    if (await verify(buffer)) {
      onBytes(buffer.byteLength);
      return buffer;
    }
    await cache?.delete(url);
  }

  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok || !response.body) throw new EngineError('model_load_failed', `${response.status} ${url}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    onBytes(value.byteLength);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!(await verify(buffer.buffer))) throw new EngineError('integrity_failed', url);
  await cache?.put(url, new Response(buffer.buffer.slice(0)));
  return buffer.buffer;
}

interface Landmarkers {
  hands: HandLandmarker;
  pose: PoseLandmarker;
}

async function loadLandmarkers(config: EngineConfig): Promise<Landmarkers> {
  const simd = await FilesetResolver.isSimdSupported();
  const { loader, binary } = wasmFiles(simd);
  // Approximate total for progress (WASM ~11 MB + models ~13.6 MB).
  const expectedBytes = 25_000_000;
  let lastError: unknown = null;

  for (const source of config.sources) {
    let received = 0;
    let lastReport = 0;
    const onBytes = (n: number) => {
      received += n;
      const progress = Math.min(0.99, received / expectedBytes);
      if (progress - lastReport >= 0.02) {
        lastReport = progress;
        send({ type: 'status', status: 'downloading', progress });
      }
    };
    try {
      send({ type: 'status', status: 'downloading', progress: 0 });
      const files: [string, string][] = [
        [source.wasmBase + loader, loader],
        [source.wasmBase + binary, binary],
        [source.handModelUrl, 'model:hand'],
        [source.poseModelUrl, 'model:pose'],
      ];
      const [loaderJs, wasmBinary, handModel, poseModel] = await Promise.all(
        files.map(([url, key]) => fetchVerified(url, config.hashes[key], onBytes)),
      );
      const fileset = {
        wasmLoaderPath: URL.createObjectURL(new Blob([loaderJs!], { type: 'text/javascript' })),
        wasmBinaryPath: URL.createObjectURL(new Blob([wasmBinary!], { type: 'application/wasm' })),
      };
      const create = async (delegate: 'GPU' | 'CPU'): Promise<Landmarkers> => {
        const hands = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: new Uint8Array(handModel!), delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        const pose = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: new Uint8Array(poseModel!), delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        return { hands, pose };
      };
      try {
        return await create('GPU');
      } catch {
        return await create('CPU');
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof EngineError) throw lastError;
  throw new EngineError('model_load_failed', String(lastError));
}

// ---- Camera -----------------------------------------------------------------

const video = document.getElementById('video') as HTMLVideoElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
let stream: MediaStream | null = null;

async function startCamera(facing: EngineFacing): Promise<void> {
  stopCamera();
  const constraints = (withFacing: boolean): MediaStreamConstraints => ({
    audio: false,
    video: {
      ...(withFacing ? { facingMode: facing === 'front' ? 'user' : 'environment' } : {}),
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    },
  });
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints(true));
  } catch (error) {
    // Some devices (e.g. laptops) have only one camera: retry without a facing preference.
    if ((error as { name?: string }).name !== 'OverconstrainedError') throw new EngineError(cameraErrorCode(error));
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints(false));
    } catch (retryError) {
      throw new EngineError(cameraErrorCode(retryError));
    }
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  const mirror = facing === 'front';
  video.classList.toggle('mirror', mirror);
  overlay.classList.toggle('mirror', mirror);
  await video.play();
}

function stopCamera(): void {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
}

// ---- Drawing ------------------------------------------------------------------

type Pt = { x: number; y: number };

/** Hand connections with finger index (0 thumb … 4 little, 5 palm). */
const HAND_BONES: [number, number, number][] = [
  [0, 1, 0], [1, 2, 0], [2, 3, 0], [3, 4, 0],
  [0, 5, 5], [5, 6, 1], [6, 7, 1], [7, 8, 1],
  [9, 10, 2], [10, 11, 2], [11, 12, 2],
  [13, 14, 3], [14, 15, 3], [15, 16, 3],
  [0, 17, 5], [17, 18, 4], [18, 19, 4], [19, 20, 4],
  [5, 9, 5], [9, 13, 5], [13, 17, 5],
];
const FINGERTIPS = [4, 8, 12, 16, 20];
const FINGER_COLORS = ['#FDBA74', '#C4B5FD', '#93C5FD', '#6EE7B7', '#F9A8D4', '#E2E8F0'];
const BODY_PAIRS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
];
const TRAIL_LENGTH = 8;
const FLASH_MS = 600;

/** Recent fingertip positions per hand (by handedness), for motion trails. */
const trails = new Map<string, Pt[][]>();
let flashUntil = 0;

function flash(): void {
  flashUntil = performance.now() + FLASH_MS;
}

function draw(
  pose: Pt[] | undefined,
  hands: { landmarks: Pt[][]; handedness?: { categoryName: string }[][] },
  reduceMotion: boolean,
): void {
  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  const ratio = devicePixelRatio || 1;
  const w = (overlay.width = overlay.clientWidth * ratio);
  const h = (overlay.height = overlay.clientHeight * ratio);
  ctx.clearRect(0, 0, w, h);
  // Map normalized video coordinates into the object-fit: cover area.
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.max(w / vw, h / vh);
  const dx = (w - vw * scale) / 2;
  const dy = (h - vh * scale) / 2;
  const px = (p: Pt) => [dx + p.x * vw * scale, dy + p.y * vh * scale] as const;
  const now = performance.now();
  const flashing = !reduceMotion && now < flashUntil;
  const glow = flashing ? 1 - (flashUntil - now) / FLASH_MS : 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (pose) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3 * ratio;
    for (const [a, b] of BODY_PAIRS) {
      const pa = pose[a];
      const pb = pose[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(...px(pa));
      ctx.lineTo(...px(pb));
      ctx.stroke();
    }
  }

  const seen = new Set<string>();
  hands.landmarks.forEach((hand, i) => {
    if (hand.length < 21) return;
    const label = hands.handedness?.[i]?.[0]?.categoryName ?? String(i);
    seen.add(label);
    // Size strokes to the hand so near and far hands look alike.
    const [wx, wy] = px(hand[0]!);
    const [kx, ky] = px(hand[9]!);
    const unit = Math.max(Math.hypot(kx - wx, ky - wy), 12 * ratio);
    const width = Math.max(unit * 0.09, 2 * ratio);

    if (!reduceMotion) {
      const history = trails.get(label) ?? FINGERTIPS.map(() => []);
      FINGERTIPS.forEach((tip, f) => {
        const points = history[f]!;
        points.push(hand[tip]!);
        if (points.length > TRAIL_LENGTH) points.shift();
        for (let k = 1; k < points.length; k++) {
          ctx.strokeStyle = FINGER_COLORS[f]!;
          ctx.globalAlpha = (k / points.length) * 0.45;
          ctx.lineWidth = width * (0.4 + (k / points.length) * 0.8);
          ctx.beginPath();
          ctx.moveTo(...px(points[k - 1]!));
          ctx.lineTo(...px(points[k]!));
          ctx.stroke();
        }
      });
      trails.set(label, history);
    }

    // Soft glow under each bone, then the bone itself.
    for (const pass of [0, 1]) {
      for (const [a, b, finger] of HAND_BONES) {
        ctx.strokeStyle = FINGER_COLORS[finger]!;
        ctx.globalAlpha = pass === 0 ? 0.22 + 0.3 * (flashing ? 1 - glow : 0) : 1;
        ctx.lineWidth = pass === 0 ? width * (2.8 + (flashing ? 2 * (1 - glow) : 0)) : width;
        ctx.beginPath();
        ctx.moveTo(...px(hand[a]!));
        ctx.lineTo(...px(hand[b]!));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFFFFF';
    hand.forEach((point, k) => {
      if (FINGERTIPS.includes(k)) return;
      const [x, y] = px(point);
      ctx.beginPath();
      ctx.arc(x, y, width * 0.55, 0, Math.PI * 2);
      ctx.fill();
    });
    FINGERTIPS.forEach((tip, f) => {
      const [x, y] = px(hand[tip]!);
      ctx.fillStyle = FINGER_COLORS[f]!;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x, y, width * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, width * 0.9, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  for (const label of [...trails.keys()]) if (!seen.has(label)) trails.delete(label);
  ctx.globalAlpha = 1;
}

// ---- Main loop -------------------------------------------------------------------

async function main(): Promise<void> {
  const config = window.__ISL_ENGINE_CONFIG__;
  if (!config) return;
  let active = config.active;
  let facing = config.facing;
  let reduceMotion = config.reduceMotion;
  let landmarkers: Landmarkers | null = null;
  let cameraOn = false;
  let busy = false;
  let lastProcessed = 0;
  let lastTimestamp = 0;
  let lastStats = 0;
  const meter = new FrameMeter();

  const fail = (error: unknown) => {
    const code = error instanceof EngineError ? error.code : 'model_load_failed';
    send({ type: 'error', code, detail: error instanceof Error ? error.message : String(error) });
  };

  const syncCamera = async () => {
    if (!landmarkers) return;
    const shouldRun = active && document.visibilityState === 'visible';
    if (shouldRun && !cameraOn) {
      cameraOn = true;
      send({ type: 'status', status: 'starting_camera' });
      try {
        await startCamera(facing);
        send({ type: 'status', status: 'running' });
      } catch (error) {
        cameraOn = false;
        fail(error);
      }
    } else if (!shouldRun && cameraOn) {
      cameraOn = false;
      stopCamera();
      send({ type: 'status', status: 'paused' });
    }
  };

  window.__islEngine = {
    receive(raw: unknown) {
      const message: HostToEngine | null = decodeHostMessage(raw);
      if (!message) return;
      if (message.type === 'setActive') {
        active = message.active;
        void syncCamera();
      } else if (message.type === 'flash') {
        flash();
      } else if (message.type === 'setReduceMotion') {
        reduceMotion = message.reduceMotion;
      } else if (message.type === 'setFacing' && message.facing !== facing) {
        facing = message.facing;
        if (cameraOn) {
          cameraOn = false;
          void syncCamera();
        }
      }
    },
  };
  window.addEventListener('message', (event) => {
    if (event.source === window.parent) window.__islEngine?.receive(event.data);
  });
  document.addEventListener('visibilitychange', () => void syncCamera());

  if (!window.isSecureContext || !crypto.subtle) return fail(new EngineError('insecure_context'));
  if (typeof WebAssembly === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return fail(new EngineError('unsupported'));
  }

  send({ type: 'status', status: 'loading' });
  try {
    landmarkers = await loadLandmarkers(config);
  } catch (error) {
    return fail(error);
  }
  await syncCamera();

  const tick = (now: number) => {
    requestAnimationFrame(tick);
    if (!landmarkers || !cameraOn || busy || video.readyState < 2) return;
    if (now - lastProcessed < 1000 / config.targetFps) return;
    busy = true;
    lastProcessed = now;
    try {
      const timestamp = Math.max(Math.round(now), lastTimestamp + 1);
      lastTimestamp = timestamp;
      const started = performance.now();
      const handsResult = landmarkers.hands.detectForVideo(video, timestamp) as unknown as HandsResultLike;
      const poseResult = landmarkers.pose.detectForVideo(video, timestamp);
      const pose = poseResult.landmarks[0];
      const { values, hands } = frameValues(pose, handsResult);
      meter.record(now, performance.now() - started);
      send({ type: 'frame', t: Date.now(), v: values, hands });
      if (config.showLandmarks) draw(pose, handsResult, reduceMotion);
      if (now - lastStats > 2000) {
        lastStats = now;
        send({ type: 'stats', fps: Math.round(meter.fps * 10) / 10, inferenceMs: Math.round(meter.inferenceMs) });
      }
    } catch (error) {
      fail(new EngineError('model_load_failed', String(error)));
    } finally {
      busy = false;
    }
  };
  requestAnimationFrame(tick);
}

void main();
