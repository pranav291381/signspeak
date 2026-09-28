import { FRAME_DIM, LEFT_HAND_PRESENT_INDEX, LEFT_HAND_START, POSE_PRESENT_INDEX } from '../featureSpec';
import { POSE_LEFT_WRIST_Y, POSE_RIGHT_WRIST_Y, REST_WRIST_Y } from '../features';
import { SignSegmenter } from '../segmenter';
import { RecognitionSession, type SessionSnapshot } from '../session';
import { PredictionStabilizer } from '../stabilizer';
import type { FrameSource, LandmarkFrame, RawPrediction, Recognition, RecognizerInfo, SignRecognizer } from '../types';

/** A person in view with the left hand raised to sign, or resting below the chest. */
function frame(raised: boolean, t = 0): LandmarkFrame {
  const values = new Float32Array(FRAME_DIM);
  values[POSE_PRESENT_INDEX] = 1;
  values[LEFT_HAND_PRESENT_INDEX] = 1;
  values[LEFT_HAND_START + 1] = raised ? 0.3 : REST_WRIST_Y + 0.3;
  values[POSE_LEFT_WRIST_Y] = raised ? 0.3 : REST_WRIST_Y + 0.3;
  values[POSE_RIGHT_WRIST_Y] = REST_WRIST_Y + 0.3;
  return { timestampMs: t, values };
}

function pushAll(segmenter: SignSegmenter, pattern: boolean[]): (LandmarkFrame[] | null)[] {
  return pattern.map((raised, i) => segmenter.push(frame(raised, i)));
}

const rest = (n: number) => Array<boolean>(n).fill(false);
const up = (n: number) => Array<boolean>(n).fill(true);

describe('SignSegmenter', () => {
  it('returns a sign whole once the hands have been down for a moment, with two frames either side', () => {
    const segmenter = new SignSegmenter();
    const out = pushAll(segmenter, [...rest(6), ...up(10), ...rest(5)]);
    const done = out.flatMap((s, i) => (s ? [{ at: i, s }] : []));
    expect(done).toHaveLength(1);
    // Ends on the fifth rest frame; holds 2 lead-in frames, the 10 raised, and 2 after.
    expect(done[0]!.at).toBe(20);
    expect(done[0]!.s.map((f) => f.timestampMs)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('keeps a sign together through a short dip of the hands', () => {
    const segmenter = new SignSegmenter();
    const out = pushAll(segmenter, [...rest(3), ...up(6), ...rest(3), ...up(6), ...rest(5)]);
    const signs = out.filter(Boolean) as LandmarkFrame[][];
    expect(signs).toHaveLength(1);
    expect(signs[0]).toHaveLength(2 + 6 + 3 + 6 + 2);
  });

  it('ignores a twitch, and splits signs separated by rest', () => {
    const segmenter = new SignSegmenter();
    const out = pushAll(segmenter, [...rest(3), ...up(2), ...rest(6), ...up(8), ...rest(6), ...up(5), ...rest(5)]);
    expect(out.filter(Boolean).map((s) => s!.length)).toEqual([12, 9]);
  });

  it('judges a very long sign as it is and starts again', () => {
    const segmenter = new SignSegmenter({ maxFrames: 20 });
    const out = pushAll(segmenter, [...rest(2), ...up(30)]);
    expect(out.filter(Boolean).map((s) => s!.length)).toEqual([20]);
    expect(segmenter.active).toBe(true);
  });
});

class ManualSource implements FrameSource {
  readonly simulated = false;
  private handler: ((f: LandmarkFrame) => void) | null = null;
  private t = 0;
  start(onFrame: (f: LandmarkFrame) => void) {
    this.handler = onFrame;
  }
  stop() {
    this.handler = null;
  }
  push(pattern: (boolean | null)[]) {
    for (const raised of pattern) {
      this.t += 67;
      this.handler?.(raised === null ? { timestampMs: this.t, values: null } : frame(raised, this.t));
    }
  }
}

class FakeRecognizer implements SignRecognizer {
  info: RecognizerInfo = { id: 'fake', kind: 'on_device', version: '1', labels: ['hello', 'water'], calibrated: false, featureSpecVersion: 1, windowSize: 32 };
  windows: number[] = [];
  next: RawPrediction = { scores: [{ label: 'hello', score: 0.9 }, { label: 'water', score: 0.1 }], latencyMs: 1 };
  async load() {}
  async predict(window: readonly LandmarkFrame[]) {
    this.windows.push(window.length);
    return this.next;
  }
  dispose() {}
}

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

async function setup() {
  const source = new ManualSource();
  const recognizer = new FakeRecognizer();
  const session = new RecognitionSession({
    source,
    recognizer,
    stabilizer: new PredictionStabilizer({ config: { minConfidence: 0.6, minMargin: 0.2 } }),
    config: { mode: 'segment', requireHands: true },
  });
  const snapshots: SessionSnapshot[] = [];
  const recognitions: Recognition[] = [];
  session.subscribe({ onSnapshot: (s) => snapshots.push(s), onRecognition: (r) => recognitions.push(r) });
  await session.start();
  return { source, recognizer, session, snapshots, recognitions };
}

describe('RecognitionSession in segment mode', () => {
  it('recognizes each finished sign once, from all of its frames', async () => {
    const { source, recognizer, session, recognitions } = await setup();
    source.push([...rest(4), ...up(12)]);
    await flush();
    expect(recognizer.windows).toEqual([]);
    expect(session.getSnapshot().status).toBe('analyzing');
    source.push(rest(5));
    await flush();
    expect(recognizer.windows).toEqual([16]);
    expect(recognitions.map((r) => r.label)).toEqual(['hello']);
    expect(session.getSnapshot().status).toBe('recognized');
    // The same sign again is shown again: it was signed twice.
    source.push([...up(10), ...rest(5)]);
    await flush();
    expect(recognitions.map((r) => r.label)).toEqual(['hello', 'hello']);
  });

  it('says it is not sure instead of guessing, until the next sign begins', async () => {
    const { source, recognizer, session, recognitions } = await setup();
    recognizer.next = { scores: [{ label: 'hello', score: 0.55 }, { label: 'water', score: 0.45 }], latencyMs: 1 };
    source.push([...rest(3), ...up(10), ...rest(5)]);
    await flush();
    expect(recognitions).toEqual([]);
    expect(session.getSnapshot()).toMatchObject({ status: 'uncertain', reason: 'low_confidence' });
    source.push(rest(10));
    expect(session.getSnapshot().status).toBe('uncertain');
    source.push(up(1));
    expect(session.getSnapshot().status).toBe('analyzing');
  });

  it('offers the likeliest signs when not sure, and takes the one the user picks', async () => {
    const { source, recognizer, session, recognitions } = await setup();
    recognizer.next = { scores: [{ label: 'hello', score: 0.5 }, { label: 'water', score: 0.45 }], latencyMs: 1 };
    source.push([...rest(3), ...up(10), ...rest(5)]);
    await flush();
    expect(session.getSnapshot().suggestions).toEqual(['hello', 'water']);
    session.choose('tea');
    expect(recognitions).toEqual([]);
    session.choose('water');
    expect(recognitions).toMatchObject([{ label: 'water', chosen: true, band: null }]);
    expect(session.getSnapshot()).toMatchObject({ status: 'recognized', suggestions: undefined });
    // A new sign clears the choice.
    source.push(up(1));
    expect(session.getSnapshot().suggestions).toBeUndefined();
  });

  it('offers the next likeliest signs after showing one; picking one replaces it', async () => {
    const { source, recognizer, session, recognitions } = await setup();
    recognizer.next = {
      scores: [
        { label: 'hello', score: 0.8 },
        { label: 'water', score: 0.15 },
        { label: 'tea', score: 0.05 },
      ],
      latencyMs: 1,
    };
    source.push([...rest(3), ...up(10), ...rest(5)]);
    await flush();
    expect(recognitions.map((r) => r.label)).toEqual(['hello']);
    expect(session.getSnapshot()).toMatchObject({ status: 'recognized', suggestions: ['water', 'tea'] });
    session.choose('water');
    expect(recognitions[1]).toMatchObject({ label: 'water', chosen: true, corrects: true });
  });

  it('reports when nobody is in view', async () => {
    const { source, session } = await setup();
    source.push(Array<null>(8).fill(null));
    expect(session.getSnapshot().status).toBe('no_signer');
    source.push(rest(1));
    expect(session.getSnapshot().status).toBe('analyzing');
  });
});
