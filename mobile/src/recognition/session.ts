import { DEFAULT_SESSION_CONFIG, type SessionConfig } from './config';
import { handsVisible } from './features';
import { PredictionStabilizer } from './stabilizer';
import {
  RecognizerUnavailableError,
  type FrameSource,
  type LandmarkFrame,
  type Recognition,
  type RecognitionStatus,
  type RecognizerInfo,
  type SignRecognizer,
  type UncertainReason,
} from './types';

export type SessionState = 'idle' | 'loading' | 'running' | 'paused' | 'model_unavailable' | 'model_error' | 'stopped';

export interface SessionSnapshot {
  state: SessionState;
  /** Live recognition status while running; null otherwise. */
  status: RecognitionStatus | null;
  reason?: UncertainReason;
  /** True when results are simulated (demo mode). */
  simulated: boolean;
  recognizer: RecognizerInfo;
}

export interface SessionListener {
  onSnapshot?(snapshot: SessionSnapshot): void;
  onRecognition?(recognition: Recognition): void;
}

/** Fraction of frames in a window that must contain a detected person. */
const MIN_PRESENT_FRACTION = 0.5;
/** With `requireHands`: fraction of frames in a window that must show a hand. */
const MIN_HANDS_FRACTION = 0.15;
/** Consecutive prediction failures before the session reports a model error. */
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * Wires FrameSource → sliding window → SignRecognizer → PredictionStabilizer
 * and publishes UI-ready snapshots. Inference is never queued: while a
 * prediction is running, new windows are skipped (backpressure), which bounds
 * latency and battery use on slow phones.
 */
export class RecognitionSession {
  private readonly source: FrameSource;
  private readonly recognizer: SignRecognizer;
  private readonly stabilizer: PredictionStabilizer;
  private readonly config: SessionConfig;
  private readonly listeners = new Set<SessionListener>();

  private window: LandmarkFrame[] = [];
  private framesSincePrediction = 0;
  private inFlight = false;
  private consecutiveErrors = 0;
  /** Incremented on pause/stop so late results from an old run are ignored. */
  private generation = 0;
  private snapshot: SessionSnapshot;

  constructor(options: {
    source: FrameSource;
    recognizer: SignRecognizer;
    stabilizer?: PredictionStabilizer;
    config?: Partial<SessionConfig>;
  }) {
    this.source = options.source;
    this.recognizer = options.recognizer;
    this.stabilizer =
      options.stabilizer ?? new PredictionStabilizer({ calibrated: options.recognizer.info.calibrated });
    this.config = { ...DEFAULT_SESSION_CONFIG, ...options.config };
    this.snapshot = {
      state: 'idle',
      status: null,
      simulated: options.recognizer.info.kind === 'simulated' || options.source.simulated,
      recognizer: options.recognizer.info,
    };
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    listener.onSnapshot?.(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.snapshot.state !== 'idle') return;
    this.publish({ state: 'loading', status: null, reason: undefined });
    const generation = this.generation;
    try {
      await this.recognizer.load();
    } catch (error) {
      if (generation !== this.generation) return;
      this.publish({
        state: error instanceof RecognizerUnavailableError ? 'model_unavailable' : 'model_error',
        status: null,
      });
      return;
    }
    if (generation !== this.generation) return;
    this.run();
  }

  pause(): void {
    if (this.snapshot.state !== 'running') return;
    this.halt();
    this.publish({ state: 'paused', status: null, reason: undefined });
  }

  resume(): void {
    if (this.snapshot.state !== 'paused') return;
    this.run();
  }

  /** Forget partial evidence (e.g. when the user taps Clear). */
  resetEvidence(): void {
    this.window = [];
    this.framesSincePrediction = 0;
    this.stabilizer.reset();
    if (this.snapshot.state === 'running') {
      this.publish({ status: 'analyzing', reason: undefined });
    }
  }

  stop(): void {
    this.halt();
    this.recognizer.dispose();
    this.publish({ state: 'stopped', status: null, reason: undefined });
    this.listeners.clear();
  }

  private run(): void {
    this.window = [];
    this.framesSincePrediction = 0;
    this.consecutiveErrors = 0;
    this.stabilizer.reset();
    this.publish({ state: 'running', status: 'analyzing', reason: undefined });
    const generation = this.generation;
    this.source.start((frame) => {
      if (generation === this.generation) this.onFrame(frame);
    });
  }

  private halt(): void {
    this.generation += 1;
    this.source.stop();
    this.inFlight = false;
    this.window = [];
  }

  private onFrame(frame: LandmarkFrame): void {
    const size = this.recognizer.info.windowSize;
    this.window.push(frame);
    if (this.window.length > size) this.window.shift();
    this.framesSincePrediction += 1;

    if (this.window.length < size || this.framesSincePrediction < this.config.stride || this.inFlight) {
      return;
    }
    this.framesSincePrediction = 0;

    const present = this.window.filter((f) => f.values !== null).length / this.window.length;
    if (present < MIN_PRESENT_FRACTION) {
      this.apply(this.stabilizer.update(null, frame.timestampMs));
      return;
    }
    if (this.config.requireHands) {
      const hands = this.window.filter((f) => handsVisible(f.values)).length / this.window.length;
      if (hands < MIN_HANDS_FRACTION) {
        this.apply({ ...this.stabilizer.update(null, frame.timestampMs), status: 'no_hands' });
        return;
      }
    }
    void this.predict([...this.window], frame.timestampMs);
  }

  private async predict(window: LandmarkFrame[], timestampMs: number): Promise<void> {
    const generation = this.generation;
    this.inFlight = true;
    try {
      const prediction = await this.recognizer.predict(window);
      if (generation !== this.generation) return;
      this.consecutiveErrors = 0;
      this.apply(this.stabilizer.update(prediction, timestampMs));
    } catch {
      if (generation !== this.generation) return;
      this.consecutiveErrors += 1;
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.halt();
        this.publish({ state: 'model_error', status: null, reason: undefined });
      }
    } finally {
      if (generation === this.generation) this.inFlight = false;
    }
  }

  private apply(step: ReturnType<PredictionStabilizer['update']>): void {
    if (step.recognition) {
      for (const l of this.listeners) l.onRecognition?.(step.recognition);
    }
    if (step.status !== this.snapshot.status || step.reason !== this.snapshot.reason) {
      this.publish({ status: step.status, reason: step.reason });
    }
  }

  private publish(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l.onSnapshot?.(this.snapshot);
  }
}
