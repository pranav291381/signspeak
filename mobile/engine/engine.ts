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
import {
  cameraErrorCode,
  delegateOrder,
  DelegateTuner,
  FrameMeter,
  frameValues,
  isSoftwareRenderer,
  shouldMirror,
  smoothPoints,
  wasmFiles,
  type Delegate,
  type HandsResultLike,
  type Pt,
} from './core';
import { EngineSignModel, type ModelMessage } from './model';

/** The sign model's web worker, bundled by scripts/build-engine.mjs. */
declare const __MODEL_WORKER__: string;

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
  delegate: Delegate;
}

interface EngineAssets {
  fileset: { wasmLoaderPath: string; wasmBinaryPath: string };
  handModel: Uint8Array;
  poseModel: Uint8Array;
}

/** Downloads (or reads from cache) and verifies the WASM runtime and both models. */
async function loadAssets(config: EngineConfig): Promise<EngineAssets> {
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
      return {
        fileset: {
          wasmLoaderPath: URL.createObjectURL(new Blob([loaderJs!], { type: 'text/javascript' })),
          wasmBinaryPath: URL.createObjectURL(new Blob([wasmBinary!], { type: 'application/wasm' })),
        },
        handModel: new Uint8Array(handModel!),
        poseModel: new Uint8Array(poseModel!),
      };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof EngineError) throw lastError;
  throw new EngineError('model_load_failed', String(lastError));
}

async function createLandmarkers(assets: EngineAssets, delegate: Delegate): Promise<Landmarkers> {
  const hands = await HandLandmarker.createFromOptions(assets.fileset, {
    baseOptions: { modelAssetBuffer: assets.handModel, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  const pose = await PoseLandmarker.createFromOptions(assets.fileset, {
    baseOptions: { modelAssetBuffer: assets.poseModel, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  return { hands, pose, delegate };
}

function closeLandmarkers(landmarkers: Landmarkers): void {
  try {
    landmarkers.hands.close();
    landmarkers.pose.close();
  } catch {
    // Already closed.
  }
}

/** The WebGL renderer's name, to spot software rendering. */
function webglRenderer(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch {
    return null;
  }
}

/** First delegate that loads, in likely-fastest order; `failures` collects why others did not. */
async function createFirstWorking(assets: EngineAssets, order: readonly Delegate[], failures: string[]): Promise<Landmarkers> {
  let lastError: unknown = null;
  for (const delegate of order) {
    try {
      return await createLandmarkers(assets, delegate);
    } catch (error) {
      lastError = error;
      failures.push(`${delegate} failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
    }
  }
  throw new EngineError('model_load_failed', String(lastError));
}

/**
 * Runs the sign model in a web worker, so tracking on this page's main thread
 * is not held up by it (on phones a forward pass takes tens of milliseconds).
 * Falls back to this thread if the WebView cannot start the worker.
 */
function startSignModel(reply: (message: EngineToHost) => void): { handle: (message: ModelMessage) => void; where: () => string } {
  let local: EngineSignModel | null = null;
  const onThisThread = (message: ModelMessage) => {
    local ??= new EngineSignModel();
    const answer = local.handle(message);
    if (answer) reply(answer);
  };
  let worker: Worker | null = null;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([__MODEL_WORKER__], { type: 'text/javascript' })));
    worker.onmessage = (event: MessageEvent<EngineToHost>) => reply(event.data);
    // A broken worker: carry on here. The app sends the pack again when told `no_model`.
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return {
    handle: (message) => (worker ? worker.postMessage(message) : onThisThread(message)),
    where: () => (worker ? 'sign model in a worker' : 'sign model on the page thread'),
  };
}

// ---- Camera -----------------------------------------------------------------

const video = document.getElementById('video') as HTMLVideoElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
let stream: MediaStream | null = null;

async function startCamera(facing: EngineFacing, webDesktopHint: boolean): Promise<void> {
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
  const reported = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
  const mirror = shouldMirror(facing, reported, webDesktopHint);
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

/** MediaPipe hand connections. */
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const LINE_COLOR = '#6C8CFF';
const JOINT_COLOR = '#2DD8B0';
/** Drawn hands follow detections with this time constant (ms): smooth, barely delayed. */
const SMOOTH_MS = 35;
const FADE_MS = 150;
const FLASH_MS = 500;

interface DrawnHand {
  points: Pt[];
  alpha: number;
}

/** Latest detected hands (normalized video coordinates), by handedness label. */
let targets = new Map<string, Pt[]>();
const drawn = new Map<string, DrawnHand>();
let lastRender = 0;
let flashUntil = 0;
let canvasSize = '';

function flash(): void {
  flashUntil = performance.now() + FLASH_MS;
}

function setTargets(result: { landmarks: Pt[][]; handedness?: { categoryName: string }[][] }): void {
  const next = new Map<string, Pt[]>();
  result.landmarks.forEach((hand, i) => {
    if (hand.length < 21) return;
    let label = result.handedness?.[i]?.[0]?.categoryName ?? `hand${i}`;
    if (next.has(label)) label = `${label}${i}`;
    next.set(label, hand);
  });
  targets = next;
}

function clearDrawing(): void {
  targets = new Map();
  drawn.clear();
  const ctx = overlay.getContext('2d');
  ctx?.clearRect(0, 0, overlay.width, overlay.height);
}

/**
 * Draws both hands on every display frame, easing toward the latest detection,
 * so the skeleton moves smoothly even when detection runs slower than the screen.
 */
function render(now: number, reduceMotion: boolean): void {
  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  const ratio = devicePixelRatio || 1;
  const size = `${overlay.clientWidth}x${overlay.clientHeight}x${ratio}`;
  if (size !== canvasSize) {
    canvasSize = size;
    overlay.width = Math.round(overlay.clientWidth * ratio);
    overlay.height = Math.round(overlay.clientHeight * ratio);
  }
  const w = overlay.width;
  const h = overlay.height;
  ctx.clearRect(0, 0, w, h);

  const dt = lastRender ? Math.min(now - lastRender, 100) : 16;
  lastRender = now;
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt / SMOOTH_MS);

  for (const [label, target] of targets) {
    const current = drawn.get(label);
    drawn.set(label, {
      points: smoothPoints(current?.points ?? null, target, k),
      alpha: Math.min(1, (current?.alpha ?? 0) + dt / FADE_MS),
    });
  }
  for (const [label, hand] of drawn) {
    if (targets.has(label)) continue;
    hand.alpha -= dt / FADE_MS;
    if (hand.alpha <= 0) drawn.delete(label);
  }
  if (drawn.size === 0) return;

  // Map normalized video coordinates into the object-fit: cover area.
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.max(w / vw, h / vh);
  const dx = (w - vw * scale) / 2;
  const dy = (h - vh * scale) / 2;
  const px = (p: Pt) => [dx + p.x * vw * scale, dy + p.y * vh * scale] as const;
  // Same visual weight as a 3 px line on a 640 px frame.
  const unit = Math.max(scale, ratio);
  const flashing = !reduceMotion && now < flashUntil;

  ctx.lineCap = 'round';
  for (const hand of drawn.values()) {
    ctx.globalAlpha = hand.alpha;
    ctx.strokeStyle = flashing ? JOINT_COLOR : LINE_COLOR;
    ctx.lineWidth = (flashing ? 4.5 : 3) * unit;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(...px(hand.points[a]!));
      ctx.lineTo(...px(hand.points[b]!));
    }
    ctx.stroke();
    ctx.fillStyle = JOINT_COLOR;
    for (const point of hand.points) {
      const [x, y] = px(point);
      ctx.beginPath();
      ctx.arc(x, y, 3 * unit, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ---- Main loop -------------------------------------------------------------------

/** Pose (for shoulder-based normalization) changes slowly: run it on every Nth detection. */
const POSE_EVERY = 3;
/** Frames posted to the app per second (recognition resamples to 15 fps). */
const SEND_FPS = 15;

async function main(): Promise<void> {
  const config = window.__ISL_ENGINE_CONFIG__;
  if (!config) return;
  let active = config.active;
  let facing = config.facing;
  let reduceMotion = config.reduceMotion;
  let landmarkers: Landmarkers | null = null;
  let assets: EngineAssets | null = null;
  let tuner: DelegateTuner | null = null;
  let switching = false;
  let cameraOn = false;
  let busy = false;
  let lastDetect = 0;
  let lastTimestamp = 0;
  let lastSent = 0;
  let lastStats = 0;
  let detections = 0;
  let pose: { x: number; y: number; z: number }[] | undefined;
  let meter = new FrameMeter();
  /** Why the current delegate (sent with the stats, logged by the app). */
  let delegateNote = '';

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
        await startCamera(facing, config.mirrorUnknown);
        send({ type: 'status', status: 'running' });
      } catch (error) {
        cameraOn = false;
        fail(error);
      }
    } else if (!shouldRun && cameraOn) {
      cameraOn = false;
      stopCamera();
      clearDrawing();
      send({ type: 'status', status: 'paused' });
    }
  };

  const signModel = startSignModel(send);
  window.__islEngine = {
    receive(raw: unknown) {
      const message: HostToEngine | null = decodeHostMessage(raw);
      if (!message) return;
      if (message.type === 'setModel' || message.type === 'predict') {
        signModel.handle(message);
      } else if (message.type === 'setActive') {
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
    assets = await loadAssets(config);
    const renderer = webglRenderer();
    const order = delegateOrder(isSoftwareRenderer(renderer));
    const failures: string[] = [];
    landmarkers = await createFirstWorking(assets, order, failures);
    tuner = new DelegateTuner(landmarkers.delegate, order.slice(order.indexOf(landmarkers.delegate)));
    delegateNote = [
      `renderer: ${renderer ?? 'unknown'}`,
      isSoftwareRenderer(renderer) ? 'software rendering, GPU skipped' : '',
      ...failures,
    ]
      .filter(Boolean)
      .join('; ');
  } catch (error) {
    return fail(error);
  }
  await syncCamera();

  /** Swap to another delegate without stopping the camera. */
  const switchTo = async (delegate: Delegate) => {
    if (!assets || !landmarkers) return;
    switching = true;
    try {
      const next = await createLandmarkers(assets, delegate);
      closeLandmarkers(landmarkers);
      landmarkers = next;
      pose = undefined;
      meter = new FrameMeter();
    } catch {
      // Keep the current delegate.
    } finally {
      switching = false;
    }
  };

  const detect = (now: number) => {
    if (!landmarkers) return;
    const timestamp = Math.max(Math.round(now), lastTimestamp + 1);
    lastTimestamp = timestamp;
    const started = performance.now();
    const handsResult = landmarkers.hands.detectForVideo(video, timestamp) as unknown as HandsResultLike;
    if (!pose || detections % POSE_EVERY === 0) {
      pose = landmarkers.pose.detectForVideo(video, timestamp).landmarks[0];
    }
    detections += 1;
    const inferenceMs = performance.now() - started;
    meter.record(now, inferenceMs);
    if (config.showLandmarks) setTargets(handsResult);

    if (now - lastSent >= 1000 / SEND_FPS - 2) {
      lastSent = now;
      const { values, hands } = frameValues(pose, handsResult, video.videoHeight / video.videoWidth);
      send({ type: 'frame', t: Date.now(), v: values, hands });
    }
    if (now - lastStats > 1000) {
      lastStats = now;
      send({
        type: 'stats',
        fps: Math.round(meter.fps * 10) / 10,
        inferenceMs: Math.round(meter.inferenceMs),
        delegate: landmarkers.delegate,
        note: [delegateNote, tuner?.settled ? `measured: ${tuner.summary()}` : '', signModel.where()].filter(Boolean).join('; '),
      });
    }
    const next = tuner?.record(inferenceMs);
    if (next && next !== landmarkers.delegate) void switchTo(next);
  };

  const tick = (now: number) => {
    requestAnimationFrame(tick);
    if (cameraOn && config.showLandmarks) render(now, reduceMotion);
    if (!landmarkers || !cameraOn || busy || switching || video.readyState < 2) return;
    if (now - lastDetect < 1000 / config.targetFps) return;
    busy = true;
    lastDetect = now;
    try {
      detect(now);
    } catch (error) {
      fail(new EngineError('model_load_failed', String(error)));
    } finally {
      busy = false;
    }
  };
  requestAnimationFrame(tick);
}

void main();
