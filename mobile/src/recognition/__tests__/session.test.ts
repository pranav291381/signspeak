import { MockSignRecognizer } from '../recognizers/MockSignRecognizer';
import { UnavailableRecognizer } from '../recognizers/UnavailableRecognizer';
import { RecognitionSession, type SessionSnapshot } from '../session';
import { SimulatedFrameSource } from '../sources';
import { PredictionStabilizer } from '../stabilizer';
import type { FrameSource, LandmarkFrame, RawPrediction, Recognition, RecognizerInfo, SignRecognizer } from '../types';

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
  get running() {
    return this.handler !== null;
  }
  push(count: number, present = true) {
    for (let i = 0; i < count; i++) {
      this.t += 67;
      this.handler?.({ timestampMs: this.t, values: present ? new Float32Array([1]) : null });
    }
  }
}

class FakeRecognizer implements SignRecognizer {
  info: RecognizerInfo = {
    id: 'fake',
    kind: 'on_device',
    version: '1',
    labels: ['hello'],
    calibrated: false,
    featureSpecVersion: 1,
    windowSize: 4,
  };
  calls = 0;
  /** Frames in each predicted window. */
  windows: number[] = [];
  loadError: Error | null = null;
  next: () => Promise<RawPrediction> = async () => ({ scores: [{ label: 'hello', score: 0.95 }], latencyMs: 1 });
  async load() {
    if (this.loadError) throw this.loadError;
  }
  predict(window: readonly LandmarkFrame[]) {
    this.calls += 1;
    this.windows.push(window.length);
    return this.next();
  }
  dispose() {}
}

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

function setup(recognizer: SignRecognizer = new FakeRecognizer()) {
  const source = new ManualSource();
  const session = new RecognitionSession({ source, recognizer, config: { stride: 2 } });
  const snapshots: SessionSnapshot[] = [];
  const recognitions: Recognition[] = [];
  session.subscribe({ onSnapshot: (s) => snapshots.push(s), onRecognition: (r) => recognitions.push(r) });
  return { source, session, snapshots, recognitions };
}

/** Push frames two at a time, letting each prediction resolve. */
async function feed(source: ManualSource, frames: number, present = true) {
  for (let i = 0; i < frames; i += 2) {
    source.push(2, present);
    await flush();
  }
}

describe('RecognitionSession', () => {
  it('reports model_unavailable instead of pretending to work', async () => {
    const { session } = setup(new UnavailableRecognizer());
    await session.start();
    expect(session.getSnapshot()).toMatchObject({ state: 'model_unavailable', status: null, simulated: false });
  });

  it('reports model_error when loading fails', async () => {
    const recognizer = new FakeRecognizer();
    recognizer.loadError = new Error('corrupt model');
    const { session } = setup(recognizer);
    await session.start();
    expect(session.getSnapshot().state).toBe('model_error');
  });

  it('predicts once the window is full, every `stride` frames, and emits stable results', async () => {
    const recognizer = new FakeRecognizer();
    const { source, session, recognitions } = setup(recognizer);
    await session.start();
    expect(session.getSnapshot()).toMatchObject({ state: 'running', status: 'analyzing' });

    await feed(source, 2);
    expect(recognizer.calls).toBe(0); // window (4 frames) not full yet
    await feed(source, 2);
    expect(recognizer.calls).toBe(1);
    await feed(source, 6);
    expect(recognizer.calls).toBe(4);
    expect(recognitions.map((r) => r.label)).toEqual(['hello']);
  });

  it('keeps a time-based window when the recognizer asks for one', async () => {
    const recognizer = new FakeRecognizer();
    recognizer.info = { ...recognizer.info, windowSize: 2, windowMs: 500 };
    const { source, session } = setup(recognizer);
    await session.start();
    await feed(source, 30);
    // Starts after the minimum frames; never holds more than ~500 ms of frames (67 ms apart).
    expect(recognizer.windows[0]).toBe(2);
    expect(Math.max(...recognizer.windows)).toBe(8);
  });

  it('does not run the model when nobody is in view', async () => {
    const recognizer = new FakeRecognizer();
    const { source, session } = setup(recognizer);
    await session.start();
    await feed(source, 8, false);
    expect(recognizer.calls).toBe(0);
    expect(session.getSnapshot().status).toBe('no_signer');
  });

  it('skips windows while a prediction is still running (backpressure)', async () => {
    const recognizer = new FakeRecognizer();
    let release: (p: RawPrediction) => void = () => undefined;
    recognizer.next = () => new Promise((resolve) => (release = resolve));
    const { source, session } = setup(recognizer);
    await session.start();
    source.push(4);
    source.push(10);
    expect(recognizer.calls).toBe(1);
    release({ scores: [], latencyMs: 1 });
    await flush();
    source.push(2);
    expect(recognizer.calls).toBe(2);
  });

  it('stops the camera feed on pause, ignores late results, and restarts on resume', async () => {
    const recognizer = new FakeRecognizer();
    let release: (p: RawPrediction) => void = () => undefined;
    recognizer.next = () => new Promise((resolve) => (release = resolve));
    const { source, session, recognitions } = setup(recognizer);
    await session.start();
    source.push(4);
    session.pause();
    expect(source.running).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ state: 'paused', status: null });
    release({ scores: [{ label: 'hello', score: 0.99 }], latencyMs: 1 });
    await flush();
    expect(recognitions).toEqual([]);
    expect(session.getSnapshot().status).toBeNull();

    session.resume();
    expect(source.running).toBe(true);
    expect(session.getSnapshot()).toMatchObject({ state: 'running', status: 'analyzing' });
  });

  it('reports model_error after repeated prediction failures', async () => {
    const recognizer = new FakeRecognizer();
    recognizer.next = () => Promise.reject(new Error('inference failed'));
    const { source, session } = setup(recognizer);
    await session.start();
    await feed(source, 4);
    await feed(source, 2);
    expect(session.getSnapshot().state).toBe('running');
    await feed(source, 2);
    expect(session.getSnapshot().state).toBe('model_error');
    expect(source.running).toBe(false);
  });

  it('uses the stricter emergency thresholds supplied by the caller', async () => {
    const recognizer = new FakeRecognizer();
    recognizer.next = async () => ({ scores: [{ label: 'help', score: 0.8 }], latencyMs: 1 });
    const source = new ManualSource();
    const session = new RecognitionSession({
      source,
      recognizer,
      stabilizer: new PredictionStabilizer({ isEmergency: (l) => l === 'help' }),
      config: { stride: 2 },
    });
    const recognitions: Recognition[] = [];
    session.subscribe({ onRecognition: (r) => recognitions.push(r) });
    await session.start();
    await feed(source, 40);
    expect(recognitions).toEqual([]);
    expect(session.getSnapshot()).toMatchObject({ status: 'uncertain', reason: 'low_confidence' });
  });
});

describe('demo mode (MockSignRecognizer + SimulatedFrameSource)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is flagged as simulated', () => {
    const session = new RecognitionSession({ source: new SimulatedFrameSource(), recognizer: new MockSignRecognizer() });
    expect(session.getSnapshot().simulated).toBe(true);
  });

  it('only shows confident, stable signs from its script', async () => {
    const session = new RecognitionSession({
      source: new SimulatedFrameSource(15),
      recognizer: new MockSignRecognizer({ seed: 7 }),
      stabilizer: new PredictionStabilizer({ isEmergency: (l) => l === 'help' }),
    });
    const labels: string[] = [];
    const statuses = new Set<string>();
    session.subscribe({
      onRecognition: (r) => labels.push(r.label),
      onSnapshot: (s) => s.status && statuses.add(s.reason ? `${s.status}:${s.reason}` : s.status),
    });
    await session.start();
    // One pass of the script: 68 predictions * 4 frames at 15 fps ≈ 18 s, plus the first window.
    for (let i = 0; i < 20 * 15; i++) {
      await jest.advanceTimersByTimeAsync(1000 / 15);
    }
    session.stop();

    expect(labels).toEqual(['hello', 'thank_you', 'water']);
    expect(statuses).toContain('uncertain:unknown_sign');
    expect(statuses).toContain('uncertain:low_confidence');
  });
});
