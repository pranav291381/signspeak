import type { ModelPack } from '@/model/modelPack';
import type { RemoteModel } from '@/model/remote';
import { encodeFrames, toXY, XY_FRAME_DIM } from '@/personal/codec';

import type { EngineToHost, HostToEngine } from './protocol';

export type EnginePrediction = Extract<EngineToHost, { type: 'prediction' }>;

/** How long to wait for the engine page before giving up on one prediction. */
const TIMEOUT_MS = 3000;

interface Pending {
  frames: readonly Float32Array[];
  resent: boolean;
  resolve: (logits: Float64Array) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Runs the sign model inside the camera engine page (engine/engine.ts). The
 * camera component attaches it once the page is loaded; the pack is sent once,
 * then each prediction sends one window (about 9 KB) and gets logits back.
 * Frames are sent as the model was trained: without depth, rounded to 0.001.
 */
export class EngineModelChannel implements RemoteModel {
  private send: ((message: HostToEngine) => void) | null = null;
  private pack: ModelPack | null = null;
  private packText: string | null = null;
  /** The current page has the pack. */
  private sent = false;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  get available(): boolean {
    return this.send !== null;
  }

  /** The engine page is loaded and takes messages. */
  attach(send: (message: HostToEngine) => void): void {
    this.send = send;
    this.sent = false;
    this.sendPack();
  }

  /** The engine page is gone: pending predictions fail. */
  detach(): void {
    this.send = null;
    this.sent = false;
    for (const [id, entry] of this.pending) this.settle(id, entry, new Error('The camera engine closed'));
  }

  load(pack: ModelPack): void {
    if (pack === this.pack) return;
    this.pack = pack;
    this.packText = JSON.stringify(pack);
    this.sent = false;
    this.sendPack();
  }

  forward(frames: readonly Float32Array[]): Promise<Float64Array> {
    if (!this.send || !this.packText) return Promise.reject(new Error('The camera engine is not ready'));
    this.sendPack();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        const entry = this.pending.get(id);
        if (entry) this.settle(id, entry, new Error('The camera engine did not answer'));
      }, TIMEOUT_MS);
      this.pending.set(id, { frames, resent: false, resolve, reject, timer });
      this.request(id, frames);
    });
  }

  /** A `prediction` message from the engine page. */
  receive(message: EnginePrediction): void {
    const entry = this.pending.get(message.id);
    if (!entry) return;
    if (message.logits) {
      this.settle(message.id, entry, Float64Array.from(message.logits));
    } else if (message.error === 'no_model' && !entry.resent) {
      // The page was reloaded (for example after the system reclaimed it): send the pack again.
      entry.resent = true;
      this.sent = false;
      this.sendPack();
      this.request(message.id, entry.frames);
    } else {
      this.settle(message.id, entry, new Error(`The camera engine could not run the model (${message.error ?? 'failed'})`));
    }
  }

  private sendPack(): void {
    if (!this.send || !this.packText || this.sent) return;
    this.send({ type: 'setModel', pack: this.packText });
    this.sent = true;
  }

  private request(id: number, frames: readonly Float32Array[]): void {
    this.send?.({ type: 'predict', id, frames: frames.length, data: encodeFrames(frames.map(toXY), XY_FRAME_DIM) });
  }

  private settle(id: number, entry: Pending, result: Float64Array | Error): void {
    clearTimeout(entry.timer);
    this.pending.delete(id);
    if (result instanceof Error) entry.reject(result);
    else entry.resolve(result);
  }
}
