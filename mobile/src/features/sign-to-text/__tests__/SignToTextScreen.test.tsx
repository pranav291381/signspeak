import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { HISTORY_STORAGE_KEY } from '@/history/history';
import type { SessionFactory } from '@/recognition/engine';
import { createRecognitionSession } from '@/recognition/engine';
import { RecognitionSession } from '@/recognition/session';
import { PredictionStabilizer } from '@/recognition/stabilizer';
import type { FrameSource, LandmarkFrame, RawPrediction, RecognizerInfo, SignRecognizer } from '@/recognition/types';
import { SETTINGS_STORAGE_KEY } from '@/settings/settings';
import type { SignPack } from '@/signpack/types';
import { SpeechService, type SpeechEngine } from '@/speech/SpeechService';
import { SpeechServiceContext } from '@/speech/useSpeech';
import { createMemoryStore } from '@/storage/keyValueStore';
import { fakeCamera } from '@/test-utils/fakeLandmarkCamera';
import { MOTIONS, perform } from '@/test-utils/landmarks';
import { testPack } from '@/test-utils/packs';
import { renderWithProviders } from '@/test-utils/render';
import { seedSigns, taughtSign } from '@/test-utils/signs';

import { buildTranscript } from '../transcript';
import { SignToTextScreen } from '../SignToTextScreen';

// ---- Platform mocks -------------------------------------------------------

const mockPermission = {
  value: null as null | { granted: boolean; canAskAgain: boolean },
  request: jest.fn(),
};

jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockPermission.value, mockPermission.request],
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ dismissTo: jest.fn(), push: mockPush }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));

// ---- Controllable recognition session --------------------------------------

class ManualSource implements FrameSource {
  readonly simulated = false;
  handler: ((f: LandmarkFrame) => void) | null = null;
  t = 0;
  start(onFrame: (f: LandmarkFrame) => void) {
    this.handler = onFrame;
  }
  stop() {
    this.handler = null;
  }
  push(n: number) {
    for (let i = 0; i < n; i++) this.handler?.({ timestampMs: (this.t += 100), values: new Float32Array([1]) });
  }
}

class ScriptedRecognizer implements SignRecognizer {
  info: RecognizerInfo = {
    id: 'test',
    kind: 'on_device',
    version: '1',
    labels: ['test:hello'],
    calibrated: false,
    featureSpecVersion: 1,
    windowSize: 1,
  };
  scores: Record<string, number> = { 'test:hello': 0.95 };
  loadError: Error | null = null;
  async load() {
    if (this.loadError) throw this.loadError;
  }
  async predict(): Promise<RawPrediction> {
    return { scores: Object.entries(this.scores).map(([label, score]) => ({ label, score })), latencyMs: 1 };
  }
  dispose() {}
}

function testSession() {
  const source = new ManualSource();
  const recognizer = new ScriptedRecognizer();
  const factory: SessionFactory = () =>
    new RecognitionSession({
      source,
      recognizer,
      stabilizer: new PredictionStabilizer({ config: { minStablePredictions: 2, uncertainAfterPredictions: 3 } }),
      config: { stride: 1 },
    });
  return { source, recognizer, factory };
}

async function pushFrames(source: ManualSource, n: number) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      source.push(1);
      await new Promise<void>((resolve) => setImmediate(() => resolve()));
    });
  }
}

/** The installed vocabulary: synthetic test movements standing in for dictionary signs. */
const pack = testPack([
  { text: 'Hello', motion: 'wave' },
  { text: 'Water', motion: 'knock' },
  { text: 'R', motion: 'hold_fist', letter: true },
  { text: 'A', motion: 'hold_two', letter: true },
  { text: 'M', motion: 'hold_open', letter: true },
]);

function makeStore(settings: object) {
  return createMemoryStore({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ appLanguage: 'en', ...settings }) });
}

async function renderScreen(options: { settings?: object; packs?: SignPack[]; factory?: SessionFactory } = {}) {
  const store = makeStore(options.settings ?? {});
  const packs = options.packs ?? [pack];
  renderWithProviders(<SignToTextScreen sessionFactory={options.factory ?? testSession().factory} />, { store, packs });
  await screen.findByTestId('landmark-camera');
  // The vocabulary loads asynchronously; recognition starts once it is known.
  if (packs.length > 0) await screen.findByTestId('vocabulary-info');
  return store;
}

/** The camera engine reports that tracking is running. */
function cameraRunning() {
  act(() => fakeCamera.status('running'));
}

beforeEach(() => {
  mockPermission.value = { granted: true, canAskAgain: true };
  mockPermission.request.mockReset();
  mockPush.mockReset();
  fakeCamera.reset();
});

// ---- Tests -----------------------------------------------------------------

describe('SignToTextScreen vocabulary', () => {
  it('says so when no sign vocabulary is installed, and offers the labelled demo', async () => {
    await renderScreen({ packs: [], factory: createRecognitionSession });
    expect(await screen.findByTestId('vocabulary-missing')).toBeOnTheScreen();
    expect(screen.getByText(/No vocabulary is included in this version of the app yet/)).toBeOnTheScreen();
    // Clean screen: no teaching or sign management from here.
    expect(screen.queryByRole('button', { name: 'Teach a sign' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'My signs' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Try demo mode (simulated)' }));
    expect(await screen.findByTestId('simulated-banner')).toBeOnTheScreen();
    expect(screen.getByText('Demo mode: simulated results')).toBeOnTheScreen();
    expect(screen.queryByTestId('vocabulary-missing')).toBeNull();
  });

  it('shows how many signs it knows and where they come from', async () => {
    await renderScreen();
    expect(screen.getByTestId('vocabulary-info')).toHaveTextContent('Recognizes 5 signs from Test dictionary.');
  });

  it('waits for the vocabulary before recognizing', async () => {
    const store = makeStore({});
    renderWithProviders(<SignToTextScreen sessionFactory={testSession().factory} />, {
      store,
      loadPacks: () => new Promise(() => undefined),
    });
    expect(await screen.findByTestId('vocabulary-loading')).toHaveTextContent('Loading the sign vocabulary…');
  });

  it('ignores signs it was not given', async () => {
    const store = makeStore({});
    renderWithProviders(<SignToTextScreen />, { store, packs: [pack] });
    await screen.findByTestId('vocabulary-info');
    // Signs taught on the phone earlier are not part of Sign → Text any more.
    await seedSigns(store, [taughtSign({ kind: 'library', signId: 'thank_you' }, 'scratch', 3)]);
    expect(screen.getByTestId('vocabulary-info')).toHaveTextContent(/5 signs/);
  });
});

describe('SignToTextScreen camera', () => {
  it('asks for camera permission with a privacy explanation', async () => {
    mockPermission.value = { granted: false, canAskAgain: true };
    const store = makeStore({});
    renderWithProviders(<SignToTextScreen sessionFactory={testSession().factory} />, { store, packs: [pack] });
    expect(await screen.findByTestId('camera-permission-request')).toBeOnTheScreen();
    expect(screen.getByText(/never recorded or uploaded/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
    expect(mockPermission.request).toHaveBeenCalled();
  });

  it('sends the user to settings when permission was permanently denied', async () => {
    mockPermission.value = { granted: false, canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const store = makeStore({});
    renderWithProviders(<SignToTextScreen sessionFactory={testSession().factory} />, { store, packs: [pack] });
    fireEvent.press(await screen.findByRole('button', { name: 'Open settings' }));
    expect(openSettings).toHaveBeenCalled();
  });

  it('shows a waiting state while permission is being checked', async () => {
    mockPermission.value = null;
    const store = makeStore({});
    renderWithProviders(<SignToTextScreen sessionFactory={testSession().factory} />, { store, packs: [pack] });
    expect(await screen.findByTestId('camera-permission-checking')).toBeOnTheScreen();
  });

  it('shows download progress while hand tracking loads for the first time', async () => {
    await renderScreen();
    act(() => fakeCamera.status('downloading', 0.42));
    expect(screen.getByText('Downloading hand tracking (one time)… 42%')).toBeOnTheScreen();
  });

  it('explains camera errors and retries', async () => {
    await renderScreen();
    act(() => fakeCamera.error('camera_in_use'));
    expect(screen.getByTestId('camera-error')).toHaveTextContent(/Another app is using the camera/);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByTestId('camera-loading')).toBeOnTheScreen();
    expect(screen.getByTestId('landmark-camera')).toBeOnTheScreen();
  });

  it('says straight away whether a person and hands are in view', async () => {
    await renderScreen();
    cameraRunning();
    expect(screen.getByTestId('live-tracking')).toHaveTextContent('Step into view');
    const [resting] = perform([{}], { durationMs: 100 });
    act(() => fakeCamera.frame(resting!.timestampMs, resting!.values));
    expect(screen.getByTestId('live-tracking')).toHaveTextContent('Show your hands');
    const [signing] = perform(MOTIONS.wave!, { durationMs: 100 });
    act(() => fakeCamera.frame(signing!.timestampMs, signing!.values));
    expect(screen.getByTestId('live-tracking')).toHaveTextContent('Hands in view');
  });

  it('shows how fast hand tracking runs', async () => {
    await renderScreen();
    cameraRunning();
    expect(screen.queryByTestId('tracking-rate')).toBeNull();
    act(() => fakeCamera.stats(27.6, 18, 'GPU'));
    expect(screen.getByTestId('tracking-rate')).toHaveTextContent('28 fps · GPU');
  });

  it('shows how tracking runs when the rate is tapped', async () => {
    await renderScreen();
    cameraRunning();
    act(() =>
      fakeCamera.stats(19.2, 62, 'CPU', 'renderer: Mali-G52; lite hand model, 2 hands workers', { model: 'lite', workers: 2, bodyFps: 12.4 }),
    );
    expect(screen.queryByTestId('tracking-details')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Show tracking details' }));
    const details = screen.getByTestId('tracking-details');
    expect(details).toHaveTextContent(/Hands: 19 a second · lite hand model \(faster\) · 2 workers in parallel/);
    expect(details).toHaveTextContent(/Body and face: 12 a second/);
    expect(details).toHaveTextContent(/Runs on the CPU/);
    expect(details).toHaveTextContent(/renderer: Mali-G52/);
    fireEvent.press(screen.getByRole('button', { name: 'Hide tracking details' }));
    expect(screen.queryByTestId('tracking-details')).toBeNull();
  });

  it('switches between back and front cameras', async () => {
    await renderScreen();
    await waitFor(() => expect(fakeCamera.props?.facing).toBe('back'));
    cameraRunning();
    fireEvent.press(screen.getByRole('button', { name: 'Switch camera' }));
    await waitFor(() => expect(fakeCamera.props?.facing).toBe('front'));
  });
});

describe('SignToTextScreen recognition', () => {
  it('shows a stable result as the dictionary gives it', async () => {
    const { factory, source } = testSession();
    await renderScreen({ settings: { outputLanguage: 'hi' }, factory });
    expect(screen.getByText('Recognised signs will appear here.')).toBeOnTheScreen();
    // Dictionary words are in English, whatever the output language; the screen says so.
    expect(screen.getByTestId('vocabulary-info')).toHaveTextContent(/Signs are shown in English, as in the dictionary\./);

    cameraRunning();
    await pushFrames(source, 2);

    expect(screen.getByTestId('recognition-text')).toHaveTextContent('Hello');
    expect(screen.getByText('Last recognised')).toBeOnTheScreen();
    // Uncalibrated recognizer: no confidence claims.
    expect(screen.queryByText(/confidence/)).toBeNull();
    // The hand skeleton flashes to confirm.
    await waitFor(() => expect(fakeCamera.props?.flashSignal).toBe(1));
  });

  it('shows simulated demo results in the output language', async () => {
    const { factory, source, recognizer } = testSession();
    recognizer.scores = { hello: 0.95 };
    await renderScreen({ settings: { outputLanguage: 'hi', demoMode: true }, factory, packs: [] });
    cameraRunning();
    await pushFrames(source, 2);
    expect(screen.getByTestId('recognition-text')).toHaveTextContent('नमस्ते');
  });

  it('says it is not sure instead of guessing', async () => {
    const { factory, source, recognizer } = testSession();
    recognizer.scores = { 'test:hello': 0.5, 'test:water': 0.5 };
    await renderScreen({ factory });
    cameraRunning();
    await pushFrames(source, 4);

    expect(screen.getByText('Not sure what was signed. Please try again.')).toBeOnTheScreen();
    expect(screen.queryByTestId('recognition-text')).toBeNull();
  });

  it('does not process frames until hand tracking is running', async () => {
    const { factory, source } = testSession();
    await renderScreen({ factory });
    await pushFrames(source, 4);
    expect(screen.queryByTestId('recognition-text')).toBeNull();
  });

  it('pauses and resumes the camera and recognition', async () => {
    const { factory, source } = testSession();
    await renderScreen({ factory });
    cameraRunning();

    fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(fakeCamera.props?.active).toBe(false));
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
    await pushFrames(source, 4);
    expect(screen.queryByTestId('recognition-text')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(fakeCamera.props?.active).toBe(true));
    await pushFrames(source, 2);
    expect(screen.getByTestId('recognition-text')).toHaveTextContent('Hello');
  });

  it('clears results', async () => {
    const { factory, source } = testSession();
    await renderScreen({ factory });
    cameraRunning();
    await pushFrames(source, 2);
    fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('recognition-text')).toBeNull();
  });

  it('reports a recognizer error with a retry', async () => {
    const { factory, recognizer } = testSession();
    recognizer.loadError = new Error('corrupt');
    await renderScreen({ factory });
    expect(await screen.findByTestId('model-error')).toBeOnTheScreen();
    recognizer.loadError = null;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByTestId('model-error')).toBeNull());
  });

  it('joins fingerspelled letters into a word in the transcript', async () => {
    const { factory, source, recognizer } = testSession();
    await renderScreen({ factory });
    cameraRunning();
    await pushFrames(source, 2);
    for (const letter of ['r', 'a', 'm']) {
      // Enough predictions for the smoothed scores to move to the new letter.
      recognizer.scores = { [`test:${letter}`]: 0.95 };
      source.t += 2000;
      await pushFrames(source, 6);
    }
    expect(screen.getByTestId('recognition-text')).toHaveTextContent('M');
    expect(screen.getByTestId('transcript')).toHaveTextContent(/Hello.*RAM/);
    expect(screen.getByText(/not a translated sentence/)).toBeOnTheScreen();
  });

  it('recognizes a vocabulary sign from live camera landmarks, end to end', async () => {
    renderWithProviders(<SignToTextScreen />, { store: makeStore({}), packs: [pack] });
    await screen.findByTestId('vocabulary-info');
    cameraRunning();

    // Another "signer": different speed and noise from the pack's recording.
    const frames = perform(MOTIONS.knock!, { seed: 7, noise: 0.02, durationMs: 1300, restBeforeMs: 1500, restAfterMs: 2500 });
    for (const frame of frames) {
      await act(async () => {
        fakeCamera.frame(frame.timestampMs, frame.values);
        await Promise.resolve();
      });
    }
    expect(screen.getByTestId('recognition-text')).toHaveTextContent('Water');
  });
});

describe('SignToTextScreen speech and history', () => {
  function fakeSpeech(voices = [{ language: 'en-IN' }, { language: 'hi-IN' }]) {
    const spoken: { text: string; language: string }[] = [];
    const engine: SpeechEngine = {
      speak: (text, options) => {
        spoken.push({ text, language: options.language });
        options.onDone();
      },
      stop: () => Promise.resolve(),
      getVoices: () => Promise.resolve(voices),
    };
    return { service: new SpeechService(engine), spoken };
  }

  async function recognizeHello(settings: object, voices?: { language: string }[]) {
    const { factory, source, recognizer } = testSession();
    const speech = fakeSpeech(voices);
    const store = makeStore(settings);
    renderWithProviders(
      <SpeechServiceContext.Provider value={speech.service}>
        <SignToTextScreen sessionFactory={factory} />
      </SpeechServiceContext.Provider>,
      { store, packs: [pack] },
    );
    await screen.findByTestId('landmark-camera');
    if (!(settings as { demoMode?: boolean }).demoMode) await screen.findByTestId('vocabulary-info');
    cameraRunning();
    await pushFrames(source, 2);
    return { ...speech, store, source, recognizer };
  }

  it('speaks what was recognized, in the language it is written in, on request', async () => {
    const { spoken } = await recognizeHello({ outputLanguage: 'hi' });
    expect(spoken).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'Speak' }));
    await waitFor(() => expect(spoken).toEqual([{ text: 'Hello', language: 'en-IN' }]));
  });

  it('speaks automatically when the user turned that on', async () => {
    const { spoken } = await recognizeHello({ autoSpeak: true });
    await waitFor(() => expect(spoken).toEqual([{ text: 'Hello', language: 'en-IN' }]));
  });

  it('shows a visible message when no voice exists for the language', async () => {
    await recognizeHello({}, [{ language: 'hi-IN' }]);
    fireEvent.press(screen.getByRole('button', { name: 'Speak' }));
    expect(await screen.findByTestId('speech-problem')).toHaveTextContent(/No English voice is installed/);
  });

  it('saves real recognitions to history only when history is on', async () => {
    const { store } = await recognizeHello({ historyEnabled: true });
    await waitFor(() => expect(JSON.parse(store.data.get(HISTORY_STORAGE_KEY) ?? '[]')).toHaveLength(1));
    expect(JSON.parse(store.data.get(HISTORY_STORAGE_KEY)!)[0]).toMatchObject({ kind: 'recognition', text: 'Hello' });
  });

  it('never saves simulated demo results', async () => {
    const { store } = await recognizeHello({ historyEnabled: true, demoMode: true });
    expect(screen.getByTestId('recognition-text')).toHaveTextContent('Hello');
    expect(store.data.has(HISTORY_STORAGE_KEY)).toBe(false);
  });
});

describe('buildTranscript', () => {
  it('joins consecutive letters and keeps signs separate', () => {
    const entry = (text: string, letter = false) => ({ text, letter });
    expect(buildTranscript([entry('Hello'), entry('R', true), entry('A', true), entry('Thanks'), entry('B', true)])).toEqual([
      { text: 'Hello', spelled: false },
      { text: 'RA', spelled: true },
      { text: 'Thanks', spelled: false },
      { text: 'B', spelled: true },
    ]);
  });
});
