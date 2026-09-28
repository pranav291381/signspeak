import { signing } from './features';
import type { LandmarkFrame } from './types';

export interface SegmenterConfig {
  /** Frames kept before the first raised frame and after the last (as in training). */
  margin: number;
  /** Frames with the hands down that end a sign. */
  endRestFrames: number;
  /** A sign longer than this is judged as it is and a new one begins. */
  maxFrames: number;
  /** Fewer raised frames than this is a twitch, not a sign. */
  minRaisedFrames: number;
}

/**
 * Must match `segment()` in ml/scripts/train_from_landmarks.py: the model is
 * trained on a recording from 2 frames before the hands rise to 2 frames after
 * they come down.
 */
export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
  margin: 2,
  endRestFrames: 5,
  maxFrames: 90,
  minRaisedFrames: 4,
};

/**
 * Cuts the live frame stream into signs: a sign starts when a hand (or wrist)
 * rises into signing space and ends once the hands have been down for a moment.
 * Each finished sign is returned whole, to be recognized at once.
 */
export class SignSegmenter {
  private readonly config: SegmenterConfig;
  private before: LandmarkFrame[] = [];
  private current: LandmarkFrame[] | null = null;
  private lastRaised = -1;
  private raisedCount = 0;

  constructor(config: Partial<SegmenterConfig> = {}) {
    this.config = { ...DEFAULT_SEGMENTER_CONFIG, ...config };
  }

  /** True while a sign is being made. */
  get active(): boolean {
    return this.current !== null;
  }

  reset(): void {
    this.before = [];
    this.current = null;
    this.lastRaised = -1;
    this.raisedCount = 0;
  }

  /** Adds a frame; returns the frames of a sign that has just ended, if any. */
  push(frame: LandmarkFrame): LandmarkFrame[] | null {
    const { margin, endRestFrames, maxFrames, minRaisedFrames } = this.config;
    const raised = signing(frame.values);
    if (!this.current) {
      if (!raised) {
        this.before.push(frame);
        if (this.before.length > margin) this.before.shift();
        return null;
      }
      this.current = [...this.before, frame];
      this.before = [];
      this.lastRaised = this.current.length - 1;
      this.raisedCount = 1;
      return null;
    }
    this.current.push(frame);
    if (raised) {
      this.lastRaised = this.current.length - 1;
      this.raisedCount += 1;
    }
    const resting = this.current.length - 1 - this.lastRaised;
    if (resting < endRestFrames && this.current.length < maxFrames) return null;

    const sign = resting >= endRestFrames ? this.current.slice(0, this.lastRaised + 1 + margin) : this.current;
    const enough = this.raisedCount >= minRaisedFrames;
    // Rest frames after the sign become the lead-in of the next one.
    this.before = resting >= endRestFrames && margin > 0 ? this.current.slice(-margin) : [];
    this.current = null;
    this.lastRaised = -1;
    this.raisedCount = 0;
    return enough ? sign : null;
  }
}
