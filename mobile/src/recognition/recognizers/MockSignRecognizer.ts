import { UNKNOWN_LABEL, type RawPrediction, type RecognizerInfo, type ScoredLabel, type SignRecognizer } from '../types';

/**
 * SIMULATED recognizer for demonstrations and UI development.
 *
 * It ignores the camera entirely and plays a fixed script of predictions,
 * including noisy, low-confidence, unknown and emergency cases, so the whole
 * pipeline (stabilizer, UI states, speech) can be exercised. It must never be
 * presented as real recognition: `info.kind` is 'simulated' and the UI shows a
 * persistent banner whenever it is active.
 */

interface Segment {
  /** Number of predictions this segment lasts. */
  length: number;
  /** Scores for each prediction; `i` is the index within the segment. */
  scores: (i: number) => Record<string, number>;
}

const confident = (label: string, score: number) => () => ({ [label]: score, [UNKNOWN_LABEL]: 1 - score });

export const DEMO_SCRIPT: Segment[] = [
  { length: 10, scores: confident('hello', 0.9) },
  { length: 4, scores: () => ({ hello: 0.35, no: 0.3, [UNKNOWN_LABEL]: 0.35 }) },
  {
    // Flickering between signs: must stay uncertain.
    length: 12,
    scores: (i) => {
      const label = ['hello', 'no', 'water'][i % 3] ?? 'hello';
      return { [label]: 0.85, [UNKNOWN_LABEL]: 0.15 };
    },
  },
  { length: 10, scores: confident('thank_you', 0.88) },
  { length: 10, scores: () => ({ [UNKNOWN_LABEL]: 0.9, water: 0.1 }) },
  // An emergency sign below the stricter emergency threshold: must not be shown.
  { length: 12, scores: confident('help', 0.8) },
  { length: 10, scores: confident('water', 0.9) },
];

/** Small deterministic pseudo-random jitter so the demo is not perfectly flat. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockSignRecognizer implements SignRecognizer {
  readonly info: RecognizerInfo;
  private readonly script: Segment[];
  private readonly jitter: number;
  private random: () => number;
  private step = 0;

  constructor(options: { script?: Segment[]; jitter?: number; seed?: number } = {}) {
    this.script = options.script ?? DEMO_SCRIPT;
    this.jitter = options.jitter ?? 0.03;
    this.random = mulberry32(options.seed ?? 42);
    const labels = new Set<string>();
    for (const segment of this.script) {
      for (let i = 0; i < segment.length; i++) {
        Object.keys(segment.scores(i)).forEach((l) => labels.add(l));
      }
    }
    this.info = {
      id: 'mock-demo',
      kind: 'simulated',
      version: '1',
      labels: [...labels],
      calibrated: false,
      featureSpecVersion: null,
      windowSize: 8,
    };
  }

  async load(): Promise<void> {
    this.step = 0;
  }

  async predict(): Promise<RawPrediction> {
    const total = this.script.reduce((n, s) => n + s.length, 0);
    let index = this.step % total;
    this.step += 1;
    let segment = this.script[0];
    for (const s of this.script) {
      if (index < s.length) {
        segment = s;
        break;
      }
      index -= s.length;
    }
    const raw = segment ? segment.scores(index) : { [UNKNOWN_LABEL]: 1 };
    const scores: ScoredLabel[] = Object.entries(raw).map(([label, score]) => ({
      label,
      score: Math.min(1, Math.max(0, score + (this.random() * 2 - 1) * this.jitter)),
    }));
    return { scores, latencyMs: 0 };
  }

  dispose(): void {}
}
