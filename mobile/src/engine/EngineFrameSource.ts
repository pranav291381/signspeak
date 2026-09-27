import type { FrameSource, LandmarkFrame } from '@/recognition/types';

/**
 * FrameSource fed by the landmark engine (LandmarkCamera). The camera component
 * pushes frames; the recognition session starts and stops listening.
 */
export class EngineFrameSource implements FrameSource {
  readonly simulated = false;
  private handler: ((frame: LandmarkFrame) => void) | null = null;

  start(onFrame: (frame: LandmarkFrame) => void): void {
    this.handler = onFrame;
  }

  stop(): void {
    this.handler = null;
  }

  get listening(): boolean {
    return this.handler !== null;
  }

  push(timestampMs: number, values: readonly number[] | null): void {
    this.handler?.({ timestampMs, values: values ? Float32Array.from(values) : null });
  }
}
