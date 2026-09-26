import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { loadSigns } from '@/personal/store';
import { createMemoryStore } from '@/storage/keyValueStore';
import { fakeCamera } from '@/test-utils/fakeLandmarkCamera';
import { MOTIONS, perform } from '@/test-utils/landmarks';
import { renderWithProviders } from '@/test-utils/render';
import { seedSigns, taughtSign } from '@/test-utils/signs';

import { parseTargets, takesWanted } from '../targets';
import { TeachScreen } from '../TeachScreen';

let mockParams: Record<string, string> = {};
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn() }),
}));
jest.mock('expo-camera', () => ({ useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()] }));
jest.mock('@/accessibility/useReduceMotion', () => ({ useReduceMotion: () => false }));

beforeEach(() => {
  mockParams = {};
  mockBack.mockReset();
  mockReplace.mockReset();
  fakeCamera.reset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('parseTargets', () => {
  const none = () => undefined;

  it('accepts library signs, custom words and letters, and rejects anything else', () => {
    expect(parseTargets({ kind: 'library', id: 'hello' }, 'en', none)).toEqual([{ kind: 'library', signId: 'hello' }]);
    expect(parseTargets({ kind: 'library', id: 'made_up' }, 'en', none)).toBeNull();
    expect(parseTargets({ kind: 'custom', text: '  Chai ' }, 'hi', none)).toEqual([{ kind: 'custom', text: 'Chai', language: 'hi' }]);
    expect(parseTargets({ kind: 'custom', text: '?!' }, 'en', none)).toBeNull();
    expect(parseTargets({ kind: 'letter', letter: 'Q' }, 'en', none)).toEqual([{ kind: 'letter', letter: 'q' }]);
    expect(parseTargets({ kind: 'letter', letter: 'ab' }, 'en', none)).toBeNull();
    expect(parseTargets({ kind: 'nope' }, 'en', none)).toBeNull();
  });

  it('walks through the letters that are not recorded yet', () => {
    const recorded = new Set(['letter:a', 'letter:c']);
    const targets = parseTargets({ kind: 'alphabet' }, 'en', (id) => (recorded.has(id) ? taughtSign({ kind: 'letter', letter: 'a' }) : undefined))!;
    expect(targets).toHaveLength(24);
    expect(targets[0]).toEqual({ kind: 'letter', letter: 'b' });
  });

  it('asks for fewer takes of a held letter than of a moving sign', () => {
    expect(takesWanted({ kind: 'letter', letter: 'a' })).toBe(2);
    expect(takesWanted({ kind: 'library', signId: 'hello' })).toBe(3);
  });
});

describe('TeachChooser', () => {
  it('suggests matching library words and offers to teach a new word', async () => {
    renderWithProviders(<TeachScreen />);
    fireEvent.changeText(await screen.findByLabelText('What does the sign mean?'), 'thank');
    expect(screen.getByTestId('teach-library-thank_you')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('teach-library-thank_you'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/signs/teach', params: { kind: 'library', id: 'thank_you' } });

    fireEvent.changeText(screen.getByLabelText('What does the sign mean?'), 'Chai');
    fireEvent.press(screen.getByRole('button', { name: 'Teach “Chai”' }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/signs/teach', params: { kind: 'custom', text: 'Chai' } });
  });
});

describe('Recorder', () => {
  /** Press Record, count down, and play `frames` into the camera while recording. */
  async function recordTake(frames: ReturnType<typeof perform>, durationMs: number) {
    fireEvent.press(screen.getByRole('button', { name: /^Record/ }));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(screen.getByTestId('teach-recording')).toBeOnTheScreen();
    const step = durationMs / frames.length;
    for (const frame of frames) {
      await act(async () => {
        fakeCamera.frame(frame.timestampMs, frame.values);
        jest.advanceTimersByTime(step);
      });
    }
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
  }

  async function renderRecorder(params: Record<string, string>, store = createMemoryStore()) {
    mockParams = params;
    jest.useFakeTimers();
    renderWithProviders(<TeachScreen />, { store });
    await act(async () => {
      jest.advanceTimersByTime(10);
    });
    expect(await screen.findByTestId('recorder')).toBeOnTheScreen();
    act(() => fakeCamera.status('running'));
    return store;
  }

  it('records, reviews and saves three takes of a sign', async () => {
    const store = await renderRecorder({ kind: 'library', id: 'hello' });
    expect(screen.getByTestId('teach-title')).toHaveTextContent('Hello');

    for (let take = 0; take < 3; take++) {
      const frames = perform(MOTIONS.wave!, { seed: take + 1, durationMs: 1200, restBeforeMs: 600, restAfterMs: 900, fps: 15 });
      await recordTake(frames, 3000);
      expect(screen.getByTestId('teach-review')).toBeOnTheScreen();
      expect(screen.queryByTestId('teach-different')).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
      });
      await waitFor(() => expect(screen.getByTestId('teach-takes')).toHaveTextContent(new RegExp(`${take + 1} of 3 takes recorded`)));
    }

    expect(screen.getByTestId('teach-done')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockBack).toHaveBeenCalled();
    const saved = await loadSigns(store);
    expect(saved.map((s) => [s.id, s.samples.length])).toEqual([['library:hello', 3]]);
  });

  it('explains a take without hands and keeps nothing', async () => {
    const store = await renderRecorder({ kind: 'custom', text: 'Chai' });
    await recordTake(perform([{}], { durationMs: 3000 }), 3000);
    expect(screen.getByTestId('teach-problem')).toHaveTextContent(/No hands were seen/);
    expect(await loadSigns(store)).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Record' })).toBeOnTheScreen();
  });

  it('warns when a take looks different from the earlier ones', async () => {
    const store = createMemoryStore();
    await seedSigns(store, [taughtSign({ kind: 'library', signId: 'water' }, 'knock', 2)]);
    await renderRecorder({ kind: 'library', id: 'water' }, store);
    await waitFor(() => expect(screen.getByTestId('teach-takes')).toHaveTextContent(/2 of 3/));
    await recordTake(perform(MOTIONS.wave!, { seed: 3, restBeforeMs: 600, restAfterMs: 900 }), 3000);
    expect(screen.getByTestId('teach-different')).toBeOnTheScreen();
  });

  it('can skip letters while recording the alphabet', async () => {
    await renderRecorder({ kind: 'alphabet' });
    expect(screen.getByTestId('teach-title')).toHaveTextContent('A');
    expect(screen.getByText('Letter 1 of 26')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('teach-skip'));
    expect(screen.getByTestId('teach-title')).toHaveTextContent('B');
  });

  it('keeps the record button disabled until hand tracking runs', async () => {
    mockParams = { kind: 'letter', letter: 'a' };
    renderWithProviders(<TeachScreen />);
    expect(await screen.findByRole('button', { name: 'Record' })).toBeDisabled();
    act(() => fakeCamera.status('running'));
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
  });
});
