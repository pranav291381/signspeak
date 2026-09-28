import { DEFAULT_SESSION_CONFIG, type SessionConfig } from './config';
import { handsVisible } from './features';
import { SignSegmenter } from './segmenter';
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
  /**
   * Segment mode, to choose from: when not sure, the likeliest signs; after a
   * sign is shown, the next likeliest, in case it was not the one made.
   */
  suggestions?: string[];
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
/** Segment mode: frames in a row without a person, or without hands, before saying so (~0.5 s / 1 s). */
const NO_SIGNER_FRAMES = 8;
const NO_HANDS_FRAMES = 15;

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
  private readonly segmenter = new SignSegmenter();
  /** Segment mode: a finished sign waiting while the previous one is still being recognized. */
  private pendingSegment: { frames: LandmarkFrame[]; timestampMs: number } | null = null;
  private framesWithoutSigner = 0;
  private framesWithoutHands = 0;

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
    this.segmenter.reset();
    this.pendingSegment = null;
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
    this.segmenter.reset();
    this.pendingSegment = null;
    this.framesWithoutSigner = 0;
    this.framesWithoutHands = 0;
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
    this.segmenter.reset();
    this.pendingSegment = null;
  }

  private onFrame(frame: LandmarkFrame): void {
    if (this.config.mode === 'segment') {
      this.onSegmentFrame(frame);
      return;
    }
    const { windowSize: size, windowMs } = this.recognizer.info;
    this.window.push(frame);
    if (windowMs) {
      const cutoff = frame.timestampMs - windowMs;
      while (this.window.length > 1 && this.window[0]!.timestampMs < cutoff) this.window.shift();
    } else if (this.window.length > size) {
      this.window.shift();
    }
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

  /** Segment mode: collect a sign while it is made; recognize it once it is finished. */
  private onSegmentFrame(frame: LandmarkFrame): void {
    this.framesWithoutSigner = frame.values === null ? this.framesWithoutSigner + 1 : 0;
    this.framesWithoutHands = frame.values !== null && !handsVisible(frame.values) ? this.framesWithoutHands + 1 : 0;
    const wasActive = this.segmenter.active;
    const sign = this.segmenter.push(frame);
    if (sign) {
      if (this.inFlight) this.pendingSegment = { frames: sign, timestampMs: frame.timestampMs };
      else void this.predict(sign, frame.timestampMs);
      return;
    }
    if (this.segmenter.active) {
      // A new sign has begun: the last result gives way to "watching".
      if (!wasActive) this.apply({ status: 'analyzing' });
      return;
    }
    if (this.inFlight) return;
    if (this.framesWithoutSigner >= NO_SIGNER_FRAMES) this.apply({ status: 'no_signer' });
    else if (this.config.requireHands && this.framesWithoutHands >= NO_HANDS_FRAMES) this.apply({ status: 'no_hands' });
    else if (this.snapshot.status === 'no_signer' || this.snapshot.status === 'no_hands') this.apply({ status: 'analyzing' });
  }

  private async predict(window: LandmarkFrame[], timestampMs: number): Promise<void> {
    const generation = this.generation;
    this.inFlight = true;
    try {
      const prediction = await this.recognizer.predict(window);
      if (generation !== this.generation) return;
      this.consecutiveErrors = 0;
      this.apply(
        this.config.mode === 'segment' ? this.stabilizer.judge(prediction, timestampMs) : this.stabilizer.update(prediction, timestampMs),
      );
    } catch {
      if (generation !== this.generation) return;
      this.consecutiveErrors += 1;
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.halt();
        this.publish({ state: 'model_error', status: null, reason: undefined });
      }
    } finally {
      if (generation === this.generation) {
        this.inFlight = false;
        const next = this.pendingSegment;
        this.pendingSegment = null;
        if (next) void this.predict(next.frames, next.timestampMs);
      }
    }
  }

  /**
   * The user picked one of the suggestions: it counts as recognized (marked as
   * chosen), and replaces the sign just shown if there was one. Anything that
   * is not currently suggested is ignored.
   */
  choose(label: string): void {
    if (!this.snapshot.suggestions?.includes(label)) return;
    const corrects = this.snapshot.status === 'recognized';
    const recognition: Recognition = { label, band: null, timestampMs: Date.now(), chosen: true, ...(corrects ? { corrects } : {}) };
    for (const l of this.listeners) l.onRecognition?.(recognition);
    this.publish({ status: 'recognized', reason: undefined, suggestions: undefined });
  }

  private apply(step: ReturnType<PredictionStabilizer['update']>): void {
    if (step.recognition) {
      for (const l of this.listeners) l.onRecognition?.(step.recognition);
    }
    const suggestions = step.suggestions?.length ? step.suggestions : undefined;
    if (
      step.status !== this.snapshot.status ||
      step.reason !== this.snapshot.reason ||
      suggestions?.join() !== this.snapshot.suggestions?.join()
    ) {
      this.publish({ status: step.status, reason: step.reason, suggestions });
    }
  }

  private publish(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l.onSnapshot?.(this.snapshot);
  }
}
