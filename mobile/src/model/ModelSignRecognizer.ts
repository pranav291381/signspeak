import { signing } from '@/recognition/features';
import { COORDS, FRAME_DIM, PRESENCE_START } from '@/recognition/featureSpec';
import {
  UNKNOWN_LABEL,
  type LandmarkFrame,
  type RawPrediction,
  type RecognizerInfo,
  type SignRecognizer,
} from '@/recognition/types';

import type { ModelPack } from './modelPack';
import type { RemoteModel } from './remote';
import { SignModel } from './signModel';
import { softmax } from './temporalModel';

/** Frames with a hand or wrist raised needed in a window before the model is asked. */
const MIN_RAISED_FRAMES = 3;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The model is trained on landmarks without depth (MediaPipe's depth is too
 * noisy across cameras), so depth is zeroed here too.
 */
export function withoutDepth(values: ArrayLike<number>, dim: number): Float32Array {
  const out = Float32Array.from({ length: dim }, (_, i) => values[i] ?? 0);
  for (let i = 2; i < PRESENCE_START; i += COORDS) out[i] = 0;
  return out;
}

/**
 * Recognizes the signs of a trained model pack from the last `windowFrames`
 * frames. With a `remote` runner (the camera engine page), the forward pass
 * runs there whenever it is available; otherwise here.
 */
export class ModelSignRecognizer implements SignRecognizer {
  readonly info: RecognizerInfo;
  private model: SignModel | null = null;
  private loaded = false;
  private readonly labels: string[];

  constructor(
    private readonly pack: ModelPack,
    private readonly remote?: RemoteModel,
  ) {
    this.labels = pack.labels.map((l) => (l.id === pack.unknownLabel ? UNKNOWN_LABEL : l.id));
    this.info = {
      id: `model:${pack.id}`,
      kind: 'on_device',
      version: pack.createdAt,
      labels: this.labels,
      calibrated: pack.calibrated,
      featureSpecVersion: pack.featureSpecVersion,
      windowSize: pack.windowFrames,
      stabilizer: pack.stabilizer,
      mode: pack.mode,
    };
  }

  async load(): Promise<void> {
    if (this.remote) this.remote.load(this.pack);
    else this.model = new SignModel(this.pack);
    this.loaded = true;
  }

  async predict(window: readonly LandmarkFrame[]): Promise<RawPrediction> {
    const started = now();
    if (!this.loaded) throw new Error('Model not loaded');
    // Window packs read the last frames; segment packs a whole sign, however long.
    const recent = this.pack.mode === 'segment' ? window : window.slice(-this.pack.windowFrames);
    const frames = recent.map((f) => (f.values ? withoutDepth(f.values, FRAME_DIM) : new Float32Array(FRAME_DIM)));
    if (frames.filter((f) => signing(f)).length < MIN_RAISED_FRAMES) {
      // Hands down or out of view: nothing is being signed.
      return { scores: [{ label: UNKNOWN_LABEL, score: 1 }], latencyMs: now() - started, idle: true };
    }
    const logits = this.remote?.available ? await this.remote.forward(frames) : this.local().forward(frames);
    const probabilities = softmax(logits, this.pack.temperature);
    return {
      scores: this.labels.map((label, i) => ({ label, score: probabilities[i]! })),
      latencyMs: now() - started,
    };
  }

  dispose(): void {
    this.model = null;
    this.loaded = false;
  }

  private local(): SignModel {
    return (this.model ??= new SignModel(this.pack));
  }
}
