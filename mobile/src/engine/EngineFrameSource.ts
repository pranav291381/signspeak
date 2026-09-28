import { FrameResampler } from '@/recognition/resample';
import type { FrameSource, LandmarkFrame } from '@/recognition/types';

import { EngineModelChannel } from './EngineModelChannel';

/**
 * FrameSource fed by the landmark engine (LandmarkCamera). The camera component
 * pushes frames; the recognition session starts and stops listening.
 */
export class EngineFrameSource implements FrameSource {
  readonly simulated = false;
  /** Runs the sign model in the engine page; the camera component attaches it. */
  readonly model = new EngineModelChannel();
  private handler: ((frame: LandmarkFrame) => void) | null = null;
  /** Keeps 15 frames a second even when the phone tracks fewer. */
  private readonly resampler = new FrameResampler();

  start(onFrame: (frame: LandmarkFrame) => void): void {
    this.resampler.reset();
    this.handler = onFrame;
  }

  stop(): void {
    this.handler = null;
  }

  get listening(): boolean {
    return this.handler !== null;
  }

  push(timestampMs: number, values: readonly number[] | null): void {
    if (!this.handler) return;
    for (const frame of this.resampler.push({ timestampMs, values: values ? Float32Array.from(values) : null })) this.handler?.(frame);
  }
}
