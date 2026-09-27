import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { HISTORY_STORAGE_KEY } from '@/history/history';
import type { PersonalSign } from '@/personal/types';
import type { SessionFactory } from '@/recognition/engine';
import { createRecognitionSession } from '@/recognition/engine';
import { RecognitionSession } from '@/recognition/session';
import { PredictionStabilizer } from '@/recognition/stabilizer';
import type { FrameSource, LandmarkFrame, RawPrediction, RecognizerInfo, SignRecognizer } from '@/recognition/types';
import { SETTINGS_STORAGE_KEY } from '@/settings/settings';
import { SpeechService, type SpeechEngine } from '@/speech/SpeechService';
import { SpeechServiceContext } from '@/speech/useSpeech';
import { createMemoryStore } from '@/storage/keyValueStore';
import { fakeCamera } from '@/test-utils/fakeLandmarkCamera';
import { MOTIONS, perform } from '@/test-utils/landmarks';
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
    labels: ['library:hello'],
    calibrated: false,
    featureSpecVersion: 1,
    windowSize: 1,
  };
  scores: Record<string, number> = { 'library:hello': 0.95 };
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

const hello = taughtSign({ kind: 'library', signId: 'hello' });
const letterSigns = ['r', 'a', 'm'].map((letter) => taughtSign({ kind: 'letter', letter }, 'hold_fist'));

async function makeStore(settings: object, signs: PersonalSign[] = [hello]) {
  const store = createMemoryStore({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ appLanguage: 'en', ...settings }) });
  await seedSigns(store, signs);
  return store;
}

async function renderScreen(options: { settings?: object; signs?: PersonalSign[]; factory?: SessionFactory } = {}) {
  const store = await makeStore(options.settings ?? {}, options.signs);
  renderWithProviders(<SignToTextScreen sessionFactory={options.factory ?? testSession().factory} />, { store });
  await screen.findByTestId('landmark-camera');
  // Taught signs load asynchronously; recognition starts once they are known.
  if ((options.signs ?? [hello]).length > 0) await screen.findByTestId('known-signs');
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

describe('SignToTextScreen without taught signs', () => {
  it('shows live tracking and explains how to teach the first sign', async () => {
    await renderScreen({ signs: [], factory: createRecognitionSession });
    expect(await screen.findByTestId('teach-first')).toBeOnTheScreen();
    expect(screen.getByText(/Recognition works with signs recorded on this phone/)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Teach a sign' }));
    expect(mockPush).toHaveBeenCalledWith('/signs/teach');
    fireEvent.press(screen.getByRole('button', { name: 'Record the alphabet' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/teach', params: { kind: 'alphabet' } });
  });

  it('can switch to clearly labelled demo mode', async () => {
    await renderScreen({ signs: [], factory: createRecognitionSession });
    fireEvent.press(await screen.findByRole('button', { name: 'Try demo mode (simulated)' }));
    expect(await screen.findByTestId('simulated-banner')).toBeOnTheScreen();
    expect(screen.getByText('Demo mode: simulated results')).toBeOnTheScreen();
    expect(screen.queryByTestId('teach-first')).toBeNull();
  });
});

describe('SignToTextScreen camera', () => {
  it('asks for camera permission with a privacy explanation', async () => {
    mockPermission.value = { granted: false, canAskAgain: true };
    const store = await makeStore({});
    renderWithProviders(<SignToTextScreen sessionFactory={testSession().factory} />, { store });
    expect(await screen.findByTestId('camera-permission-request')).toBeOnTheScreen();
    expect(screen.getByText(/never recorded or uploaded/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
    expect(mockPermission.request).toHaveBeenCalled();
  });

  it('sends the user to settings when permission was permanently denied', async () => {
    mockPermission.value = { granted: false, canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const store = await makeStore({});
    renderWithProviders(<SignToTextScreen sessionFactory={testSession().factory} />, { store });
    fireEvent.press(await screen.findByRole('button', { name: 'Open settings' }));
    expect(openSettings).toHaveBeenCalled();
  });

  it('shows a waiting state while permission is being checked', async () => {
    mockPermission.value = null;
    const store = await makeStore({});
    renderWithProviders(<SignToTextScreen sessionFactory={testSession().factory} />, { store });
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

  it('switches between back and front cameras', async () => {
    await renderScreen();
    await waitFor(() => expect(fakeCamera.props?.facing).toBe('back'));
    cameraRunning();
    fireEvent.press(screen.getByRole('button', { name: 'Switch camera' }));
    await waitFor(() => expect(fakeCamera.props?.facing).toBe('front'));
  });
});

describe('SignToTextScreen recognition', () => {
  it('shows a stable result in the output language, independent of the app language', async () => {
    const { factory, source } = testSession();
    await renderScreen({ settings: { outputLanguage: 'hi' }, factory });
    expect(screen.getByText('Recognised signs will appear here.')).toBeOnTheScreen();

    cameraRunning();
    await pushFrames(source, 2);

    expect(screen.getByTestId('recognition-text')).toHaveTextContent('नमस्ते');
    // UI stays in English.
    expect(screen.getByText('Last recognised')).toBeOnTheScreen();
    // Uncalibrated recognizer: no confidence claims.
    expect(screen.queryByText(/confidence/)).toBeNull();
    // The hand skeleton flashes to confirm.
    await waitFor(() => expect(fakeCamera.props?.flashSignal).toBe(1));
  });

  it('says it is not sure instead of guessing', async () => {
    const { factory, source, recognizer } = testSession();
    recognizer.scores = { 'library:hello': 0.5, 'library:no': 0.5 };
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
    await renderScreen({ factory, signs: [hello, ...letterSigns] });
    cameraRunning();
    await pushFrames(source, 2);
    for (const letter of ['r', 'a', 'm']) {
      // Enough predictions for the smoothed scores to move to the new letter.
      recognizer.scores = { [`letter:${letter}`]: 0.95 };
      source.t += 2000;
      await pushFrames(source, 6);
    }
    expect(screen.getByTestId('recognition-text')).toHaveTextContent('M');
    expect(screen.getByTestId('transcript')).toHaveTextContent(/Hello.*RAM/);
    expect(screen.getByText(/not a translated sentence/)).toBeOnTheScreen();
  });

  it('recognizes a taught sign from live camera landmarks, end to end', async () => {
    const store = await makeStore({}, [
      taughtSign({ kind: 'library', signId: 'hello' }, 'wave', 3),
      taughtSign({ kind: 'library', signId: 'water' }, 'knock', 3),
    ]);
    renderWithProviders(<SignToTextScreen />, { store });
    await screen.findByTestId('landmark-camera');
    await waitFor(() => expect(screen.getByTestId('known-signs')).toHaveTextContent(/Recognizes 2 signs/));
    cameraRunning();

    const frames = perform(MOTIONS.knock!, { seed: 7, noise: 0.02, restBeforeMs: 1500, restAfterMs: 2500 });
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
    const store = await makeStore(settings);
    renderWithProviders(
      <SpeechServiceContext.Provider value={speech.service}>
        <SignToTextScreen sessionFactory={factory} />
      </SpeechServiceContext.Provider>,
      { store },
    );
    await screen.findByTestId('landmark-camera');
    if (!(settings as { demoMode?: boolean }).demoMode) await screen.findByTestId('known-signs');
    cameraRunning();
    await pushFrames(source, 2);
    return { ...speech, store, source, recognizer };
  }

  it('speaks what was recognized in the output language on request', async () => {
    const { spoken } = await recognizeHello({ outputLanguage: 'hi' });
    expect(spoken).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'Speak' }));
    await waitFor(() => expect(spoken).toEqual([{ text: 'नमस्ते', language: 'hi-IN' }]));
  });

  it('speaks automatically when the user turned that on', async () => {
    const { spoken } = await recognizeHello({ autoSpeak: true });
    await waitFor(() => expect(spoken).toEqual([{ text: 'Hello', language: 'en-IN' }]));
  });

  it('shows a visible message when no voice exists for the output language', async () => {
    await recognizeHello({ outputLanguage: 'hi' }, [{ language: 'en-IN' }]);
    fireEvent.press(screen.getByRole('button', { name: 'Speak' }));
    expect(await screen.findByTestId('speech-problem')).toHaveTextContent(/No हिन्दी voice is installed/);
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
