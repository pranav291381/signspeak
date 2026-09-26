import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { SessionFactory } from '@/recognition/engine';
import { createRecognitionSession } from '@/recognition/engine';
import { RecognitionSession } from '@/recognition/session';
import { PredictionStabilizer } from '@/recognition/stabilizer';
import type { FrameSource, LandmarkFrame, RawPrediction, RecognizerInfo, SignRecognizer } from '@/recognition/types';
import { HISTORY_STORAGE_KEY } from '@/history/history';
import { SETTINGS_STORAGE_KEY } from '@/settings/settings';
import { SpeechService, type SpeechEngine } from '@/speech/SpeechService';
import { SpeechServiceContext } from '@/speech/useSpeech';
import { createMemoryStore } from '@/storage/keyValueStore';
import { renderWithProviders } from '@/test-utils/render';

import { SignToTextScreen } from '../SignToTextScreen';

// ---- Platform mocks -------------------------------------------------------

const mockCamera = {
  permission: null as null | { granted: boolean; canAskAgain: boolean },
  request: jest.fn(),
  props: null as null | { onCameraReady?: () => void; onMountError?: (e: { message: string }) => void; active?: boolean; facing?: string },
};

jest.mock('expo-camera', () => {
  const { View } = jest.requireActual('react-native');
  return {
    useCameraPermissions: () => [mockCamera.permission, mockCamera.request],
    CameraView: (props: typeof mockCamera.props) => {
      mockCamera.props = props;
      return <View testID="camera-view" />;
    },
  };
});

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn() }),
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
    labels: ['hello'],
    calibrated: false,
    featureSpecVersion: 1,
    windowSize: 1,
  };
  scores: Record<string, number> = { hello: 0.95 };
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

function settingsStore(settings: object) {
  return createMemoryStore({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ appLanguage: 'en', ...settings }) });
}

beforeEach(() => {
  mockCamera.permission = { granted: true, canAskAgain: true };
  mockCamera.request.mockReset();
  mockCamera.props = null;
});

// ---- Tests -----------------------------------------------------------------

describe('SignToTextScreen', () => {
  it('says recognition is unavailable (no model) and does not open the camera', async () => {
    renderWithProviders(<SignToTextScreen sessionFactory={createRecognitionSession} />, { store: settingsStore({}) });
    expect(await screen.findByTestId('model-unavailable')).toBeOnTheScreen();
    expect(screen.getByText('Sign recognition is not available yet')).toBeOnTheScreen();
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });

  it('can switch to clearly labelled demo mode from the unavailable state', async () => {
    renderWithProviders(<SignToTextScreen sessionFactory={createRecognitionSession} />, { store: settingsStore({}) });
    fireEvent.press(await screen.findByRole('button', { name: 'Try demo mode (simulated)' }));
    expect(await screen.findByTestId('simulated-banner')).toBeOnTheScreen();
    expect(screen.getByText('Demo mode: simulated results')).toBeOnTheScreen();
    expect(screen.getByTestId('camera-view')).toBeOnTheScreen();
  });

  it('asks for camera permission with a privacy explanation', async () => {
    mockCamera.permission = { granted: false, canAskAgain: true };
    const { factory } = testSession();
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    expect(await screen.findByTestId('camera-permission-request')).toBeOnTheScreen();
    expect(screen.getByText(/never recorded or uploaded/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
    expect(mockCamera.request).toHaveBeenCalled();
  });

  it('sends the user to settings when permission was permanently denied', async () => {
    mockCamera.permission = { granted: false, canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const { factory } = testSession();
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    fireEvent.press(await screen.findByRole('button', { name: 'Open settings' }));
    expect(openSettings).toHaveBeenCalled();
  });

  it('shows a waiting state while permission is being checked', async () => {
    mockCamera.permission = null;
    const { factory } = testSession();
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    expect(await screen.findByTestId('camera-permission-checking')).toBeOnTheScreen();
  });

  it('shows a recoverable error when the camera cannot start', async () => {
    const { factory } = testSession();
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    await screen.findByTestId('camera-view');
    act(() => mockCamera.props?.onMountError?.({ message: 'no camera' }));
    expect(screen.getByTestId('camera-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByTestId('camera-view')).toBeOnTheScreen();
  });

  it('shows a stable result in the output language, independent of the app language', async () => {
    const { factory, source } = testSession();
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({ outputLanguage: 'hi' }) });
    await screen.findByTestId('camera-view');
    expect(screen.getByText('Recognised signs will appear here.')).toBeOnTheScreen();

    act(() => mockCamera.props?.onCameraReady?.());
    await pushFrames(source, 2);

    expect(screen.getByTestId('recognition-text')).toHaveTextContent('नमस्ते');
    // UI stays in English.
    expect(screen.getByText('Last recognised')).toBeOnTheScreen();
    // Uncalibrated recognizer: no confidence claims.
    expect(screen.queryByText(/confidence/)).toBeNull();
  });

  it('says it is not sure instead of guessing', async () => {
    const { factory, source, recognizer } = testSession();
    recognizer.scores = { hello: 0.5, no: 0.5 };
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    await screen.findByTestId('camera-view');
    act(() => mockCamera.props?.onCameraReady?.());
    await pushFrames(source, 4);

    expect(screen.getByText('Not sure what was signed. Please try again.')).toBeOnTheScreen();
    expect(screen.queryByTestId('recognition-text')).toBeNull();
  });

  it('does not process frames until the camera is ready', async () => {
    const { factory, source } = testSession();
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    await screen.findByTestId('camera-view');
    await pushFrames(source, 4);
    expect(screen.queryByTestId('recognition-text')).toBeNull();
  });

  it('pauses and resumes the camera and recognition', async () => {
    const { factory, source } = testSession();
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    await screen.findByTestId('camera-view');
    act(() => mockCamera.props?.onCameraReady?.());

    fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(screen.getByText('Paused')).toBeOnTheScreen());
    expect(mockCamera.props?.active).toBe(false);
    await pushFrames(source, 4);
    expect(screen.queryByTestId('recognition-text')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(mockCamera.props?.active).toBe(true));
    await pushFrames(source, 2);
    expect(screen.getByTestId('recognition-text')).toHaveTextContent('Hello');
  });

  it('clears results', async () => {
    const { factory, source } = testSession();
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    await screen.findByTestId('camera-view');
    act(() => mockCamera.props?.onCameraReady?.());
    await pushFrames(source, 2);
    fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('recognition-text')).toBeNull();
  });

  it('switches between back and front cameras', async () => {
    const { factory } = testSession();
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    await screen.findByTestId('camera-view');
    expect(mockCamera.props?.facing).toBe('back');
    fireEvent.press(screen.getByRole('button', { name: 'Switch camera' }));
    expect(mockCamera.props?.facing).toBe('front');
  });

  it('reports a model error with a retry', async () => {
    const { factory, recognizer } = testSession();
    recognizer.loadError = new Error('corrupt');
    renderWithProviders(<SignToTextScreen sessionFactory={factory} />, { store: settingsStore({}) });
    expect(await screen.findByTestId('model-error')).toBeOnTheScreen();
    recognizer.loadError = null;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('camera-view')).toBeOnTheScreen();
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
    const store = settingsStore(settings);
    renderWithProviders(
      <SpeechServiceContext.Provider value={speech.service}>
        <SignToTextScreen sessionFactory={factory} />
      </SpeechServiceContext.Provider>,
      { store },
    );
    await screen.findByTestId('camera-view');
    act(() => mockCamera.props?.onCameraReady?.());
    await pushFrames(source, 2);
    return { ...speech, store, source, recognizer };
  }

  it('speaks the latest result in the output language on request', async () => {
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

  it('lists the signs recognised so far without presenting them as a sentence', async () => {
    const { source, recognizer } = await recognizeHello({});
    // A pause long enough to survive smoothing releases the first sign
    // (a single unclear frame would not)…
    recognizer.scores = { hello: 0.3, water: 0.3 };
    await pushFrames(source, 4);
    // …then the same sign again, after the duplicate-suppression window.
    recognizer.scores = { hello: 0.95 };
    source.t += 5000;
    await pushFrames(source, 6);
    expect(screen.getByTestId('transcript')).toHaveTextContent(/Hello · Hello/);
    expect(screen.getByText(/not a translated sentence/)).toBeOnTheScreen();
  });
});
