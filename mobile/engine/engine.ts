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
  BODY_CONNECTIONS,
  cameraErrorCode,
  delegateOrder,
  DelegateTuner,
  FACE_POINTS,
  FrameMeter,
  frameValues,
  headCircle,
  isSoftwareRenderer,
  isVisible,
  maxHandWorkers,
  shouldMirror,
  smoothPoints,
  TrackingTuner,
  wasmFiles,
  type Delegate,
  type HandModel,
  type HandsResultLike,
  type Pt,
  type TrackingSetup,
} from './core';
import { liteHandBundle } from './liteHand';
import { EngineSignModel, type ModelMessage } from './model';
import type { TrackedPoint, TrackerReply, TrackerRequest, TrackerRole } from './trackerProtocol';

/** The sign model's web worker and the tracking worker, bundled by scripts/build-engine.mjs. */
declare const __MODEL_WORKER__: string;
declare const __TRACKER_WORKER__: string;

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
  /** The source the files came from (for the lite hand model). */
  source: EngineConfig['sources'][number];
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
        source,
      };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof EngineError) throw lastError;
  throw new EngineError('model_load_failed', String(lastError));
}

/**
 * MediaPipe's lite hand model as a Tasks bundle (see liteHand.ts), or null if
 * it cannot be downloaded or does not come out exactly as tested.
 */
async function loadLiteHandModel(config: EngineConfig, assets: EngineAssets): Promise<Uint8Array | null> {
  try {
    const lite = await fetchVerified(assets.source.handLiteModelUrl, config.hashes['model:hand-lite'], () => undefined);
    const bundle = liteHandBundle(assets.handModel, new Uint8Array(lite));
    const expected = config.hashes['bundle:hand-lite'];
    const digest = toHex(await crypto.subtle.digest('SHA-256', bundle));
    return !expected || digest === expected ? bundle : null;
  } catch {
    return null;
  }
}

async function createLandmarkers(assets: EngineAssets, delegate: Delegate, handModel: Uint8Array = assets.handModel): Promise<Landmarkers> {
  const hands = await HandLandmarker.createFromOptions(assets.fileset, {
    baseOptions: { modelAssetBuffer: handModel, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  let pose: PoseLandmarker;
  try {
    pose = await PoseLandmarker.createFromOptions(assets.fileset, {
      baseOptions: { modelAssetBuffer: assets.poseModel, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  } catch (error) {
    // Do not keep the hand model (and its memory) when the pair cannot be made.
    hands.close();
    throw error;
  }
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
async function createFirstWorking(
  assets: EngineAssets,
  order: readonly Delegate[],
  failures: string[],
  handModel: Uint8Array = assets.handModel,
): Promise<Landmarkers> {
  let lastError: unknown = null;
  for (const delegate of order) {
    try {
      return await createLandmarkers(assets, delegate, handModel);
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
/** Detection failures in a row (page thread) after which tracking stops trying. */
const MAX_DETECT_FAILURES = 30;

let stream: MediaStream | null = null;
/** Counts camera starts and stops: a start that is overtaken by a later stop or start gives its camera back. */
let cameraRequest = 0;

/** Starts the camera; resolves to false if it was stopped (or restarted) while starting. */
async function startCamera(facing: EngineFacing, webDesktopHint: boolean): Promise<boolean> {
  stopCamera();
  const request = cameraRequest;
  const constraints = (withFacing: boolean): MediaStreamConstraints => ({
    audio: false,
    video: {
      ...(withFacing ? { facingMode: facing === 'front' ? 'user' : 'environment' } : {}),
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    },
  });
  let opened: MediaStream;
  try {
    opened = await navigator.mediaDevices.getUserMedia(constraints(true));
  } catch (error) {
    // Some devices (e.g. laptops) have only one camera: retry without a facing preference.
    if (request !== cameraRequest) return false; // no longer wanted: its failure does not matter
    if ((error as { name?: string }).name !== 'OverconstrainedError') throw new EngineError(cameraErrorCode(error));
    try {
      opened = await navigator.mediaDevices.getUserMedia(constraints(false));
    } catch (retryError) {
      if (request !== cameraRequest) return false;
      throw new EngineError(cameraErrorCode(retryError));
    }
  }
  if (request !== cameraRequest) {
    // Stopped while the camera was opening (screen left, paused, switched): do not keep it on.
    opened.getTracks().forEach((track) => track.stop());
    return false;
  }
  stream = opened;
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  const reported = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
  const mirror = shouldMirror(facing, reported, webDesktopHint);
  video.classList.toggle('mirror', mirror);
  overlay.classList.toggle('mirror', mirror);
  await video.play();
  return request === cameraRequest;
}

function stopCamera(): void {
  cameraRequest += 1;
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
const BODY_COLOR = 'rgba(255, 255, 255, 0.72)';
const BODY_SHADOW = 'rgba(14, 16, 20, 0.35)';
/** Drawn hands and body follow detections with this time constant (ms): smooth, barely delayed. */
const SMOOTH_MS = 35;
const FADE_MS = 150;
const FLASH_MS = 500;
/** The overlay is drawn at no more than this many pixels per CSS pixel (sharp enough, less work). */
const MAX_OVERLAY_RATIO = 2;

interface Drawn {
  points: Pt[];
  alpha: number;
}

/** Latest detected hands (normalized video coordinates), by handedness label. */
let targets = new Map<string, Pt[]>();
const drawn = new Map<string, Drawn>();
/** Latest body (all 33 pose points) and which of them are in view. */
let bodyTarget: { points: Pt[]; visible: boolean[] } | null = null;
let drawnBody: (Drawn & { visible: boolean[] }) | null = null;
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

function setBody(pose: TrackedPoint[] | undefined | null): void {
  bodyTarget = pose && pose.length >= 25 ? { points: pose, visible: pose.map((p) => isVisible(p)) } : null;
}

function clearDrawing(): void {
  targets = new Map();
  drawn.clear();
  bodyTarget = null;
  drawnBody = null;
  const ctx = overlay.getContext('2d');
  ctx?.clearRect(0, 0, overlay.width, overlay.height);
}

/**
 * Draws the hands, body and face on every display frame, easing toward the
 * latest detection, so the skeleton moves smoothly even when detection runs
 * slower than the screen.
 */
function render(now: number, reduceMotion: boolean): void {
  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  const ratio = Math.min(devicePixelRatio || 1, MAX_OVERLAY_RATIO);
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
  if (bodyTarget) {
    drawnBody = {
      points: smoothPoints(drawnBody?.points ?? null, bodyTarget.points, k, 0.35),
      visible: bodyTarget.visible,
      alpha: Math.min(1, (drawnBody?.alpha ?? 0) + dt / FADE_MS),
    };
  } else if (drawnBody) {
    drawnBody.alpha -= dt / FADE_MS;
    if (drawnBody.alpha <= 0) drawnBody = null;
  }
  if (drawn.size === 0 && !drawnBody) return;

  // Map normalized video coordinates into the object-fit: cover area.
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.max(w / vw, h / vh);
  const dx = (w - vw * scale) / 2;
  const dy = (h - vh * scale) / 2;
  const px = (p: Pt) => [dx + p.x * vw * scale, dy + p.y * vh * scale] as const;
  const at = (p: Pt): Pt => {
    const [x, y] = px(p);
    return { x, y };
  };
  // Same visual weight as a 3 px line on a 640 px frame.
  const unit = Math.max(scale, ratio);
  const flashing = !reduceMotion && now < flashUntil;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (drawnBody) {
    const { points, visible } = drawnBody;
    ctx.globalAlpha = drawnBody.alpha;
    const bodyPath = () => {
      ctx.beginPath();
      for (const [a, b] of BODY_CONNECTIONS) {
        if (!visible[a] || !visible[b]) continue;
        ctx.moveTo(...px(points[a]!));
        ctx.lineTo(...px(points[b]!));
      }
      const pair = (a: number, b: number): [Pt, Pt] | null => (visible[a] && visible[b] ? [at(points[a]!), at(points[b]!)] : null);
      const head = headCircle(pair(FACE_POINTS.leftEar, FACE_POINTS.rightEar), pair(FACE_POINTS.leftEye, FACE_POINTS.rightEye));
      if (head) {
        ctx.moveTo(head.x + head.r, head.y);
        ctx.arc(head.x, head.y, head.r, 0, Math.PI * 2);
      }
      const mouth = pair(FACE_POINTS.mouthLeft, FACE_POINTS.mouthRight);
      if (mouth) {
        ctx.moveTo(mouth[0].x, mouth[0].y);
        ctx.lineTo(mouth[1].x, mouth[1].y);
      }
      ctx.stroke();
    };
    // A soft dark edge keeps the white lines readable on light backgrounds.
    ctx.strokeStyle = BODY_SHADOW;
    ctx.lineWidth = 5 * unit;
    bodyPath();
    ctx.strokeStyle = BODY_COLOR;
    ctx.lineWidth = 2.5 * unit;
    bodyPath();
    ctx.fillStyle = BODY_COLOR;
    for (const index of [FACE_POINTS.leftEye, FACE_POINTS.rightEye, FACE_POINTS.nose]) {
      if (!visible[index]) continue;
      const [x, y] = px(points[index]!);
      ctx.beginPath();
      ctx.arc(x, y, 2.5 * unit, 0, Math.PI * 2);
      ctx.fill();
    }
  }

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
    ctx.beginPath();
    for (const point of hand.points) {
      const [x, y] = px(point);
      ctx.moveTo(x + 3 * unit, y);
      ctx.arc(x, y, 3 * unit, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- Tracking workers --------------------------------------------------------------

/** A worker that has not started within this time is given up (ms). */
const WORKER_START_TIMEOUT_MS = 30_000;

/** One MediaPipe landmarker in a worker (engine/tracker.ts). */
class TrackerWorker {
  busy = false;
  /** Crashed after starting: no more frames. */
  dead = false;
  private readonly worker: Worker;
  private readonly started: Promise<void>;

  constructor(
    url: string,
    readonly role: TrackerRole,
    init: Omit<Extract<TrackerRequest, { type: 'init' }>, 'type' | 'role'>,
    onReply: (worker: TrackerWorker, reply: TrackerReply) => void,
  ) {
    this.worker = new Worker(url);
    this.started = new Promise((resolve, reject) => {
      let ready = false;
      const timer = setTimeout(() => reject(new Error('worker did not start')), WORKER_START_TIMEOUT_MS);
      this.worker.onmessage = (event: MessageEvent<TrackerReply>) => {
        const reply = event.data;
        if (reply.type === 'ready') {
          ready = true;
          clearTimeout(timer);
          resolve();
        } else if (reply.type === 'failed' && !ready) {
          clearTimeout(timer);
          reject(new Error(reply.message));
        } else onReply(this, reply);
      };
      this.worker.onerror = (event) => {
        clearTimeout(timer);
        if (!ready) reject(new Error(event.message || 'worker error'));
        else {
          this.dead = true;
          onReply(this, { type: 'failed', message: event.message || 'worker stopped' });
        }
      };
    });
    // Each worker gets its own copy of the model.
    this.worker.postMessage({ type: 'init', role, ...init, model: init.model.slice() } satisfies TrackerRequest);
  }

  ready(): Promise<void> {
    return this.started;
  }

  send(message: Extract<TrackerRequest, { type: 'frame' }>): void {
    this.busy = true;
    this.worker.postMessage(message, [message.bitmap]);
  }

  stop(): void {
    this.worker.terminate();
  }
}

/** Workers need these; old WebViews (and some browsers) lack one of them. */
function workersSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined';
}

/** A phone or tablet (touch screen), where tracking is usually slow. */
function isPhone(): boolean {
  return Boolean(window.ReactNativeWebView) || matchMedia('(pointer: coarse)').matches;
}

const SETUP_KEY = 'signspeak-tracking-setup-v1';
/** Set while trying more hands workers (read after the phone stopped the page). */
const TRYING_KEY = 'signspeak-trying-workers-v1';
/** Most hands workers to use on this device, after a stop while trying more. */
const CAP_KEY = 'signspeak-worker-cap-v1';

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Storage is optional.
    }
  },
};

/**
 * Hands workers allowed here: the cores' limit, lowered for good when the app
 * reports that the phone stopped the page while (or after) more workers ran.
 */
function workerLimit(afterStop: boolean): number {
  const tried = Number(storage.get(TRYING_KEY));
  storage.set(TRYING_KEY, null);
  if (afterStop) {
    let used = tried;
    try {
      used = Math.max(used, Number((JSON.parse(storage.get(SETUP_KEY) ?? 'null') as Partial<TrackingSetup> | null)?.workers ?? 0));
    } catch {
      // Nothing remembered.
    }
    if (used > 1) {
      storage.set(CAP_KEY, String(used - 1));
      storage.set(SETUP_KEY, null);
    }
  }
  const cap = Number(storage.get(CAP_KEY));
  const cores = maxHandWorkers(navigator.hardwareConcurrency);
  return cap >= 1 ? Math.min(cores, cap) : cores;
}

function rememberedSetup(order: readonly Delegate[], liteAvailable: boolean, limit: number): TrackingSetup | null {
  try {
    const value = JSON.parse(storage.get(SETUP_KEY) ?? 'null') as Partial<TrackingSetup> | null;
    if (!value || !order.includes(value.delegate as Delegate)) return null;
    if (value.model !== 'full' && value.model !== 'lite') return null;
    if (value.model === 'lite' && !liteAvailable) return null;
    const workers = Math.round(Number(value.workers));
    if (!(workers >= 1 && workers <= limit)) return null;
    return { delegate: value.delegate as Delegate, model: value.model, workers };
  } catch {
    return null;
  }
}

// ---- Main loop -------------------------------------------------------------------

/** On the page's main thread, pose runs on every Nth detection (shoulder-based normalization changes slowly). */
const POSE_EVERY = 3;
/** Body tracking in its own worker: at most this often. */
const POSE_FPS = 15;
/** Frames posted to the app per second (recognition resamples to 15 fps). */
const SEND_FPS = 15;

async function main(): Promise<void> {
  const given = window.__ISL_ENGINE_CONFIG__;
  if (!given) return;
  const config: EngineConfig = given;
  let active = config.active;
  let facing = config.facing;
  let reduceMotion = config.reduceMotion;
  let assets: EngineAssets | null = null;
  let cameraOn = false;
  let lastTimestamp = 0;
  let lastSent = 0;
  let lastStats = 0;
  let meter = new FrameMeter();
  let bodyMeter = new FrameMeter();
  let pose: TrackedPoint[] | undefined;
  /** Why the current setup (sent with the stats, logged by the app). */
  let setupNote = '';

  const fail = (error: unknown) => {
    const code = error instanceof EngineError ? error.code : 'model_load_failed';
    send({ type: 'error', code, detail: error instanceof Error ? error.message : String(error) });
  };
  const nextTimestamp = (now: number) => {
    lastTimestamp = Math.max(Math.round(now), lastTimestamp + 1);
    return lastTimestamp;
  };

  const syncCamera = async () => {
    if (!assets) return;
    const shouldRun = active && document.visibilityState === 'visible';
    if (shouldRun && !cameraOn) {
      cameraOn = true;
      send({ type: 'status', status: 'starting_camera' });
      try {
        if (await startCamera(facing, config.mirrorUnknown)) send({ type: 'status', status: 'running' });
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
  let renderer: string | null = null;
  let order: Delegate[] = ['CPU'];
  try {
    assets = await loadAssets(config);
    renderer = webglRenderer();
    order = delegateOrder(isSoftwareRenderer(renderer));
  } catch (error) {
    return fail(error);
  }
  const loaded = assets;
  const phone = isPhone();
  // Phones start with the lite hand model; elsewhere it is fetched in the background in case tracking turns out slow.
  let liteModel: Uint8Array | null = null;
  const litePromise = loadLiteHandModel(config, loaded).then((model) => (liteModel = model));
  if (phone) await litePromise;
  const handModelFor = (model: HandModel) => (model === 'lite' && liteModel ? liteModel : loaded.handModel);
  const rendererNote = [`renderer: ${renderer ?? 'unknown'}`, isSoftwareRenderer(renderer) ? 'software rendering, GPU skipped' : ''];

  /** Sends the tracking stats once a second. */
  const reportStats = (now: number, extra: { delegate: Delegate; model: HandModel; workers: number; note: string }) => {
    if (now - lastStats < 1000) return;
    lastStats = now;
    send({
      type: 'stats',
      fps: Math.round(meter.fps * 10) / 10,
      inferenceMs: Math.round(meter.inferenceMs),
      delegate: extra.delegate,
      model: extra.model,
      workers: extra.workers,
      bodyFps: Math.round(bodyMeter.fps * 10) / 10,
      note: [...rendererNote, extra.note, signModel.where()].filter(Boolean).join('; '),
    });
  };

  /** Hands found: draw them, and post a frame to the app (at most SEND_FPS a second). */
  const onHands = (result: HandsResultLike, capturedAt: number, now: number) => {
    if (config.showLandmarks) setTargets(result);
    if (now - lastSent < 1000 / SEND_FPS - 2) return;
    lastSent = now;
    const { values, hands } = frameValues(pose, result, video.videoHeight / video.videoWidth);
    // Timestamp of the camera frame, not of the result (tracking takes a while).
    send({ type: 'frame', t: Math.round(Date.now() - (now - capturedAt)), v: values, hands });
  };

  if (workersSupported() && (await runInWorkers())) return;
  await runOnMainThread();

  /**
   * Tracking in workers: hands (one or more, taking frames in turn) and pose in
   * parallel, off the thread that draws. False if workers cannot run here.
   */
  async function runInWorkers(): Promise<boolean> {
    const url = URL.createObjectURL(new Blob([__TRACKER_WORKER__], { type: 'text/javascript' }));
    const maxWorkers = workerLimit(config.afterStop === true);
    let handWorkers: TrackerWorker[] = [];
    let poseWorker: TrackerWorker | null = null;
    let current: TrackingSetup | null = null;
    let tuner: TrackingTuner | null = null;
    let changing = false;
    let restartAfterChange = false;
    let capturing = false;
    let saved = false;
    let lastDispatch = 0;
    let lastPoseDispatch = 0;
    let nextHands = 0;
    let frameId = 0;
    let lastHandsId = 0;
    const captured = new Map<number, number>();
    const failures: string[] = [];

    const onReply = (worker: TrackerWorker, reply: TrackerReply) => {
      worker.busy = false;
      const now = performance.now();
      if (reply.type === 'failed') {
        failures.push(`${worker.role} worker: ${reply.message}`.slice(0, 200));
        // A hands worker that crashed is dropped; with no hands worker or no body worker left, tracking starts again.
        if (worker.dead) {
          handWorkers = handWorkers.filter((w) => w !== worker);
          if (handWorkers.length === 0 || worker.role === 'pose') {
            if (current && !changing) {
              const setup = current;
              current = null;
              void change(setup);
            } else if (changing) {
              // Mid-change: start again once the change is done.
              restartAfterChange = true;
            }
          }
        }
        return;
      }
      if (reply.type === 'pose') {
        pose = reply.landmarks ?? undefined;
        bodyMeter.record(now, reply.ms);
        if (config.showLandmarks) setBody(reply.landmarks);
        return;
      }
      if (reply.type !== 'hands') return;
      const capturedAt = captured.get(reply.id) ?? now;
      // Workers can finish out of order: never go back to an older frame.
      if (reply.id <= lastHandsId) return;
      lastHandsId = reply.id;
      // Frames up to this one are done (or lost with a stopped worker).
      for (const id of captured.keys()) if (id <= reply.id) captured.delete(id);
      meter.record(now, reply.ms);
      onHands(reply, capturedAt, now);
      if (!tuner || changing) return;
      const next = tuner.record(reply.ms, now);
      if (next) void change(next);
      else if (tuner.settled && current && !saved) {
        saved = true;
        storage.set(SETUP_KEY, JSON.stringify(current));
        storage.set(TRYING_KEY, null);
      }
    };

    const start = (role: TrackerRole, delegate: Delegate, model: Uint8Array) =>
      new TrackerWorker(url, role, { wasmLoaderPath: loaded.fileset.wasmLoaderPath, wasmBinaryPath: loaded.fileset.wasmBinaryPath, model, delegate }, onReply);

    /** Starts workers; if any fails, stops them all and rejects. */
    const startAll = async (roles: TrackerRole[], setup: TrackingSetup): Promise<TrackerWorker[]> => {
      const workers = roles.map((role) => start(role, setup.delegate, role === 'pose' ? loaded.poseModel : handModelFor(setup.model)));
      try {
        await Promise.all(workers.map((w) => w.ready()));
        return workers;
      } catch (error) {
        workers.forEach((w) => w.stop());
        throw error;
      }
    };

    /**
     * Moves to `setup`. New workers are started before old ones stop (a worker
     * takes a moment to load), so tracking never pauses; if they fail, the
     * current setup stays.
     */
    const apply = async (setup: TrackingSetup): Promise<void> => {
      const hands = (n: number) => Array<TrackerRole>(n).fill('hands');
      if (!current || setup.delegate !== current.delegate) {
        const started = await startAll([...hands(setup.workers), 'pose'], setup);
        handWorkers.forEach((w) => w.stop());
        poseWorker?.stop();
        poseWorker = started.pop()!;
        handWorkers = started;
      } else if (setup.model !== current.model) {
        const started = await startAll(hands(setup.workers), setup);
        handWorkers.forEach((w) => w.stop());
        handWorkers = started;
      } else if (setup.workers > handWorkers.length) {
        handWorkers = [...handWorkers, ...(await startAll(hands(setup.workers - handWorkers.length), setup))];
      } else if (setup.workers < handWorkers.length) {
        handWorkers.slice(setup.workers).forEach((w) => w.stop());
        handWorkers = handWorkers.slice(0, setup.workers);
      }
      current = setup;
      meter = new FrameMeter();
      setupNote = `${setup.model} hand model, ${setup.workers} hands worker${setup.workers === 1 ? '' : 's'} + body worker`;
    };

    const change = async (setup: TrackingSetup) => {
      changing = true;
      const previous = current;
      // Remember the attempt: if the phone stops the page while trying more workers, the next start uses fewer.
      if (previous && setup.workers > previous.workers) storage.set(TRYING_KEY, String(setup.workers));
      try {
        await apply(setup);
      } catch (error) {
        failures.push(`could not switch to ${setup.delegate}/${setup.model}/${setup.workers}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
        if (previous) tuner?.revert(previous);
      } finally {
        changing = false;
        tuner?.ready();
        if (restartAfterChange && current) {
          restartAfterChange = false;
          const again = current;
          current = null;
          void change(again);
        }
      }
    };

    // Start: the remembered setup, else the first delegate with one hands worker.
    const remembered = rememberedSetup(order, liteModel !== null, maxWorkers);
    let first: TrackingSetup = remembered ?? { delegate: order[0]!, model: phone && liteModel ? 'lite' : 'full', workers: 1 };
    try {
      await apply(first);
    } catch (error) {
      // The GPU may not work inside workers: try the CPU before giving up on workers.
      failures.push(`workers on ${first.delegate}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
      if (first.delegate === 'CPU') return false;
      order = ['CPU'];
      first = { ...first, delegate: 'CPU' };
      try {
        await apply(first);
      } catch {
        return false;
      }
    }
    tuner = new TrackingTuner(first, {
      delegates: order,
      liteAvailable: () => liteModel !== null,
      maxWorkers,
      remembered: remembered !== null && first === remembered,
    });
    await syncCamera();

    const dispatch = (now: number) => {
      // The next free hands worker, in turn.
      const live = handWorkers.filter((w) => !w.dead);
      let worker: TrackerWorker | undefined;
      for (let i = 0; i < live.length && !worker; i++) {
        const candidate = live[(nextHands + i) % live.length]!;
        if (!candidate.busy) {
          worker = candidate;
          nextHands += i;
        }
      }
      const handsFree = worker !== undefined && now - lastDispatch >= 1000 / config.targetFps;
      const target = poseWorker;
      const poseFree = target !== null && !target.dead && !target.busy && now - lastPoseDispatch >= 1000 / POSE_FPS;
      if (!handsFree && !poseFree) return;
      capturing = true;
      const timestamp = nextTimestamp(now);
      const id = ++frameId;
      if (handsFree && worker) {
        lastDispatch = now;
        nextHands += 1;
        worker.busy = true;
      }
      if (poseFree) {
        lastPoseDispatch = now;
        target.busy = true;
      }
      Promise.all([handsFree ? createImageBitmap(video) : null, poseFree ? createImageBitmap(video) : null])
        .then(([forHands, forPose]) => {
          if (forHands && worker) {
            captured.set(id, now);
            worker.send({ type: 'frame', id, timestamp, bitmap: forHands });
          }
          if (forPose && target) target.send({ type: 'frame', id, timestamp, bitmap: forPose });
        })
        .catch(() => {
          if (handsFree && worker) worker.busy = false;
          if (poseFree && target) target.busy = false;
        })
        .finally(() => {
          capturing = false;
        });
    };

    const tick = (now: number) => {
      requestAnimationFrame(tick);
      if (cameraOn && config.showLandmarks) render(now, reduceMotion);
      if (!current) return;
      reportStats(now, {
        delegate: current.delegate,
        model: current.model,
        workers: handWorkers.length,
        note: [setupNote, tuner ? `measured: ${tuner.summary()}` : '', ...failures.slice(-2)].filter(Boolean).join('; '),
      });
      if (!cameraOn || changing || capturing || video.readyState < 2) return;
      dispatch(now);
    };
    requestAnimationFrame(tick);
    return true;
  }

  /** The fallback: both landmarkers on this thread, pose on every POSE_EVERY-th detection. */
  async function runOnMainThread(): Promise<void> {
    let landmarkers: Landmarkers;
    let tuner: DelegateTuner;
    let switching = false;
    let busy = false;
    let lastDetect = 0;
    let detectFailures = 0;
    let broken = false;
    let detections = 0;
    const model: HandModel = phone && liteModel ? 'lite' : 'full';
    const failures: string[] = [];
    try {
      landmarkers = await createFirstWorking(loaded, order, failures, handModelFor(model));
      tuner = new DelegateTuner(landmarkers.delegate, order.slice(order.indexOf(landmarkers.delegate)));
    } catch (error) {
      return fail(error);
    }
    setupNote = [`${model} hand model on the page thread`, ...failures].join('; ');
    await syncCamera();

    const switchTo = async (delegate: Delegate) => {
      switching = true;
      try {
        const next = await createLandmarkers(loaded, delegate, handModelFor(model));
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
      const timestamp = nextTimestamp(now);
      const started = performance.now();
      const handsResult = landmarkers.hands.detectForVideo(video, timestamp) as unknown as HandsResultLike;
      if (!pose || detections % POSE_EVERY === 0) {
        pose = landmarkers.pose.detectForVideo(video, timestamp).landmarks[0] as TrackedPoint[] | undefined;
        bodyMeter.record(now, 0);
        if (config.showLandmarks) setBody(pose);
      }
      detections += 1;
      const inferenceMs = performance.now() - started;
      meter.record(now, inferenceMs);
      onHands(handsResult, now, now);
      const next = tuner.record(inferenceMs);
      if (next && next !== landmarkers.delegate) void switchTo(next);
    };

    const tick = (now: number) => {
      requestAnimationFrame(tick);
      if (cameraOn && config.showLandmarks) render(now, reduceMotion);
      reportStats(now, {
        delegate: landmarkers.delegate,
        model,
        workers: 0,
        note: [setupNote, tuner.settled ? `measured: ${tuner.summary()}` : ''].filter(Boolean).join('; '),
      });
      if (!cameraOn || busy || switching || broken || video.readyState < 2) return;
      if (now - lastDetect < 1000 / config.targetFps) return;
      busy = true;
      lastDetect = now;
      try {
        detect(now);
        detectFailures = 0;
      } catch (error) {
        // Report it once, not on every frame; after many failures in a row, stop trying.
        detectFailures += 1;
        if (detectFailures === 1) fail(new EngineError('model_load_failed', String(error)));
        if (detectFailures >= MAX_DETECT_FAILURES) broken = true;
      } finally {
        busy = false;
      }
    };
    requestAnimationFrame(tick);
  }
}

void main();
