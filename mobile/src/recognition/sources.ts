import type { FrameSource, LandmarkFrame } from './types';

/**
 * Emits placeholder frames on a timer, as if a signer were in view.
 * Used only with the simulated recognizer; it does not read the camera.
 */
export class SimulatedFrameSource implements FrameSource {
  readonly simulated = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly values = new Float32Array([1]);

  constructor(private readonly fps = 15) {}

  start(onFrame: (frame: LandmarkFrame) => void): void {
    this.stop();
    this.timer = setInterval(() => onFrame({ timestampMs: Date.now(), values: this.values }), 1000 / this.fps);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/** Produces no frames. Used when there is no recognizer to feed. */
export class NoFrameSource implements FrameSource {
  readonly simulated = false;
  start(): void {}
  stop(): void {}
}
