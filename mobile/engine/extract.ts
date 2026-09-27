/**
 * Offline landmark extraction for sign packs (scripts/build-sign-pack.mjs).
 *
 * Runs in Chromium and uses exactly what the app's camera engine uses —
 * MediaPipe Tasks Vision with the same models, `frameValues` and the same
 * sample clean-up as teaching a sign — so a dictionary video produces the same
 * kind of numbers as live signing. Videos are processed frame by frame at the
 * sample rate (15 fps), not in real time, so results do not depend on speed.
 */
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

import { decodeSpecFrames, encodeFrames, toXY, XY_FRAME_DIM } from '../src/personal/codec';
import { buildReferenceTemplates, prepareQuery, relativeDistance } from '../src/personal/matcher';
import { PrefilterIndex } from '../src/personal/prefilter';
import { ReferenceSignRecognizer } from '../src/personal/ReferenceSignRecognizer';
import { referenceSession } from '../src/recognition/engine';
import { prepareSample, SAMPLE_FPS } from '../src/personal/sample';
import { handsRaised, handsVisible } from '../src/recognition/features';
import type { FrameSource, LandmarkFrame, SignRecognizer } from '../src/recognition/types';
import { packReferences } from '../src/signpack/parse';
import type { SignPack } from '../src/signpack/types';
import { frameValues, wasmFiles, type HandsResultLike } from './core';

export interface ExtractResult {
  ok: boolean;
  problem?: string;
  /** Frames looked at, with a person, with hands in view, and with hands raised to sign. */
  frames: number;
  withPerson: number;
  withHands: number;
  withRaisedHands: number;
  durationMs: number;
  width: number;
  height: number;
  sample?: { frames: number; dim: number; data: string };
  /** Every frame of the video at SAMPLE_FPS (when asked for), for the accuracy test. */
  recording?: RawRecording;
}

/** All frames of a video, without depth; frames with nobody in view are listed in `missing`. */
export interface RawRecording {
  frames: number;
  dim: number;
  data: string;
  missing: number[];
}

export interface EvaluationCase {
  /** The pack's sign id this video shows, or null for a sign that is not in the pack. */
  label: string | null;
  recording: RawRecording;
}

export interface EvaluationResult {
  /** Signs the app showed, in order. */
  recognized: string[];
  /** Distance of the video to its own sign, relative to that sign's acceptance distance. */
  trueDistance?: number;
  /** The closest other sign. */
  bestOther?: { id: string; distance: number };
}

export interface SimilarSigns {
  id: string;
  /** Closest other signs, by the app's own matching, relative to the acceptance distance (≤ 1: confusable). */
  nearest: { id: string; distance: number }[];
}

declare global {
  interface Window {
    __extract?: (videoUrl: string) => Promise<ExtractResult>;
    __similar?: (pack: SignPack, count: number) => SimilarSigns[];
    __evaluate?: (pack: SignPack, cases: EvaluationCase[]) => Promise<EvaluationResult[]>;
    __extractReady?: Promise<void>;
  }
}

let hands: HandLandmarker | null = null;
let pose: PoseLandmarker | null = null;
/** MediaPipe VIDEO mode needs increasing timestamps across all videos. */
let clock = 0;

async function init(): Promise<void> {
  const base = new URL('/mediapipe/', location.href).href;
  const simd = await FilesetResolver.isSimdSupported();
  const { loader, binary } = wasmFiles(simd);
  const fileset = { wasmLoaderPath: base + 'wasm/' + loader, wasmBinaryPath: base + 'wasm/' + binary };
  // CPU: deterministic, and never slower than a software GPU.
  hands = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: base + 'hand_landmarker.task', delegate: 'CPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: base + 'pose_landmarker_lite.task', delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

/** Waits for `event` on the video; rejects on a video error or after `timeoutMs`. */
function waitFor(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', timeoutMs: number, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener(event, ok);
      video.removeEventListener('error', bad);
      if (error) reject(error);
      else resolve();
    };
    const ok = () => finish();
    const bad = () => finish(new Error(`video error: ${what} (${video.error?.message || 'unsupported format?'})`));
    const timer = setTimeout(() => finish(new Error(`video error: ${what} timed out`)), timeoutMs);
    video.addEventListener(event, ok);
    video.addEventListener('error', bad);
  });
}

async function seek(video: HTMLVideoElement, time: number): Promise<void> {
  const seeked = waitFor(video, 'seeked', 15000, `seeking to ${time.toFixed(2)} s`);
  video.currentTime = time;
  await seeked;
}

async function extract(videoUrl: string, options: { raw?: boolean } = {}): Promise<ExtractResult> {
  if (!hands || !pose) throw new Error('not initialised');
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  const loaded = waitFor(video, 'loadeddata', 60000, `cannot load ${videoUrl}`);
  video.src = videoUrl;
  await loaded;
  if (!video.videoWidth || !Number.isFinite(video.duration)) throw new Error(`video error: cannot load ${videoUrl} (no playable video track)`);

  const step = 1 / SAMPLE_FPS;
  const recorded: LandmarkFrame[] = [];
  let withPerson = 0;
  let withHands = 0;
  let withRaisedHands = 0;
  // Sample the middle of each 1/15 s slot.
  for (let t = step / 2; t < video.duration; t += step) {
    await seek(video, t);
    clock += 1000 / SAMPLE_FPS;
    const handsResult = hands.detectForVideo(video, clock) as unknown as HandsResultLike;
    const body = pose.detectForVideo(video, clock).landmarks[0];
    const { values } = frameValues(body, handsResult, video.videoHeight / video.videoWidth);
    if (values) withPerson += 1;
    if (values && handsVisible(values)) withHands += 1;
    if (values && handsRaised(values)) withRaisedHands += 1;
    recorded.push({ timestampMs: t * 1000, values: values ? Float32Array.from(values) : null });
  }
  // A gap between videos, so tracking does not carry over from the previous one.
  clock += 5000;
  video.removeAttribute('src');
  video.load();

  const base = {
    frames: recorded.length,
    withPerson,
    withHands,
    withRaisedHands,
    durationMs: Math.round(video.duration * 1000),
    width: video.videoWidth,
    height: video.videoHeight,
  };
  if (options.raw) {
    Object.assign(base, {
      recording: {
        frames: recorded.length,
        dim: XY_FRAME_DIM,
        data: encodeFrames(
          recorded.map((f) => (f.values ? toXY(f.values) : new Float32Array(XY_FRAME_DIM))),
          XY_FRAME_DIM,
        ),
        missing: recorded.flatMap((f, i) => (f.values ? [] : [i])),
      },
    });
  }
  const prepared = prepareSample(recorded);
  if (!prepared.ok) return { ok: false, problem: prepared.problem, ...base };
  return {
    ok: true,
    ...base,
    // Without depth: the pack does not need it (see XY_FRAME_DIM).
    sample: { frames: prepared.frames.length, dim: XY_FRAME_DIM, data: encodeFrames(prepared.frames.map(toXY), XY_FRAME_DIM) },
  };
}

/**
 * For each sign, the other signs its own recording comes closest to, using the
 * app's matching (first pass and DTW). Signs that are confusable with each
 * other are worth checking in the source.
 */
function similar(pack: SignPack, count: number): SimilarSigns[] {
  const templates = buildReferenceTemplates(packReferences(pack));
  const index = new PrefilterIndex(templates);
  return pack.signs.map((sign) => {
    const nearest: SimilarSigns['nearest'] = [];
    const sample = sign.samples[0];
    const query = sample ? prepareQuery(decodeSpecFrames(sample.data, sample.frames, sample.dim)) : null;
    if (query) {
      for (const template of index.candidates(query, count + 1)) {
        if (template.signId === sign.id) continue;
        nearest.push({ id: template.signId, distance: Math.round(relativeDistance(template, query) * 1000) / 1000 });
      }
    }
    nearest.sort((a, b) => a.distance - b.distance);
    return { id: sign.id, nearest: nearest.slice(0, count) };
  });
}

function decodeRecording(recording: RawRecording): (Float32Array | null)[] {
  const missing = new Set(recording.missing);
  return decodeSpecFrames(recording.data, recording.frames, recording.dim).map((values, i) => (missing.has(i) ? null : values));
}

class ManualSource implements FrameSource {
  readonly simulated = false;
  private handler: ((frame: LandmarkFrame) => void) | null = null;
  start(onFrame: (frame: LandmarkFrame) => void) {
    this.handler = onFrame;
  }
  stop() {
    this.handler = null;
  }
  push(frame: LandmarkFrame) {
    this.handler?.(frame);
  }
}

/** Lets pending predictions finish (they resolve in microtasks) before the next frame. */
const nextTask = () =>
  new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });

/** Frames of rest appended after each video (1.5 s), as a person would keep standing after signing. */
const REST_AFTER_FRAMES = Math.round(1.5 * SAMPLE_FPS);

/**
 * Plays each recording, frame by frame at 15 fps, into the same recognition
 * session as Sign → Text (recognizer, window, stride, stabilizer) and reports
 * what the app would have shown.
 */
async function evaluate(pack: SignPack, cases: EvaluationCase[]): Promise<EvaluationResult[]> {
  const references = packReferences(pack);
  const recognizer = new ReferenceSignRecognizer(references, { id: 'sign-pack-dtw', version: '1', emptyMessage: 'No usable signs' });
  await recognizer.load();
  // Loaded once and shared; each video gets a fresh session and stabilizer, like opening Sign → Text.
  const shared: SignRecognizer = {
    info: recognizer.info,
    load: async () => undefined,
    predict: (window) => recognizer.predict(window),
    dispose: () => undefined,
  };
  const templates = buildReferenceTemplates(references);
  const byId = new Map(templates.map((t) => [t.signId, t]));
  const index = new PrefilterIndex(templates);

  const results: EvaluationResult[] = [];
  for (const test of cases) {
    const frames = decodeRecording(test.recording);
    const source = new ManualSource();
    const session = referenceSession(shared, source);
    const recognized: string[] = [];
    session.subscribe({ onRecognition: (r) => recognized.push(r.label) });
    await session.start();
    let t = 0;
    for (const values of [...frames, ...Array.from({ length: REST_AFTER_FRAMES }, () => frames.at(-1) ?? null)]) {
      source.push({ timestampMs: t, values });
      t += 1000 / SAMPLE_FPS;
      await nextTask();
    }
    session.stop();

    const result: EvaluationResult = { recognized };
    const query = prepareQuery(frames);
    if (query) {
      const truth = test.label ? byId.get(test.label) : undefined;
      if (truth) result.trueDistance = Math.round(relativeDistance(truth, query) * 1000) / 1000;
      for (const template of index.candidates(query, 8)) {
        if (template.signId === test.label) continue;
        const distance = Math.round(relativeDistance(template, query) * 1000) / 1000;
        if (!result.bestOther || distance < result.bestOther.distance) result.bestOther = { id: template.signId, distance };
      }
    }
    results.push(result);
  }
  return results;
}

window.__extractReady = init();
window.__extract = extract;
window.__similar = similar;
window.__evaluate = evaluate;
