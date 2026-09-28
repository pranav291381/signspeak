import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { HISTORY_STORAGE_KEY } from '@/history/history';
import { SETTINGS_STORAGE_KEY } from '@/settings/settings';
import { createMemoryStore } from '@/storage/keyValueStore';
import { testMotionPack } from '@/test-utils/motion';
import { renderWithProviders } from '@/test-utils/render';
import { seedSigns, taughtSign } from '@/test-utils/signs';

import { TextToIslScreen } from '../TextToIslScreen';

const mockPush = jest.fn();
let mockParams: { text?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => mockParams }));
let mockReduceMotion = false;
jest.mock('@/accessibility/useReduceMotion', () => ({ useReduceMotion: () => mockReduceMotion }));
// Playback itself is tested in diagram/__tests__/motion.test.tsx; here the movement stays put.
jest.mock('@/diagram/useAnimationFrames', () => ({ useAnimationFrames: () => undefined }));

const pack = testMotionPack([
  { text: 'Hello', category: 'Greetings' },
  { text: 'How are you', category: 'Greetings', motion: 'knock' },
  { text: 'Good Morning', category: 'Greetings', motion: 'point_arc' },
  { text: 'Thank you', category: 'Greetings', motion: 'two_hands' },
  { text: 'Teacher', category: 'Jobs' },
  { text: 'Team', category: 'Society', motion: 'knock' },
  { text: 'You', category: 'Pronouns' },
  { text: 'You (plural)', category: 'Pronouns', motion: 'two_hands' },
]);

async function show(text: string) {
  fireEvent.changeText(await screen.findByLabelText('Words or a sentence in English'), text);
  fireEvent.press(screen.getByRole('button', { name: 'Show signs' }));
}

beforeEach(() => {
  mockPush.mockReset();
  mockReduceMotion = false;
  mockParams = {};
});

describe('TextToIslScreen', () => {
  it('offers examples that can be shown, every sign by group, and says where the signs come from', async () => {
    renderWithProviders(<TextToIslScreen />, { motionPacks: [pack] });
    expect(await screen.findByRole('button', { name: 'Show Hello, how are you?' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show Good morning' })).toBeOnTheScreen();
    // "Happy new year" has no recorded signs in this pack, so it is not offered.
    expect(screen.queryByRole('button', { name: 'Show Happy new year' })).toBeNull();
    expect(screen.getByText('All 8 signs')).toBeOnTheScreen();
    expect(screen.getByTestId('text-to-isl-source')).toHaveTextContent(/Deaf students of St\. Louis School for the Deaf/);

    fireEvent.press(screen.getByRole('button', { name: 'Greetings, 4 signs' }));
    fireEvent.press(within(screen.getByTestId('dictionary-signs')).getByRole('button', { name: 'Show Good Morning' }));
    expect(await screen.findByTestId('sentence-player')).toBeOnTheScreen();
    expect(screen.getByTestId('sentence-caption')).toHaveTextContent('Good Morning');
    expect(screen.getByLabelText('Words or a sentence in English').props.value).toBe('Good Morning');
  });

  it('asks for text when the input is empty', async () => {
    renderWithProviders(<TextToIslScreen />, { motionPacks: [pack] });
    await screen.findByText('All 8 signs');
    await show('   ');
    expect(screen.getByTestId('text-to-isl-empty')).toBeOnTheScreen();
  });

  it('plays a sentence as signs, with a still diagram of each and an honest note on grammar', async () => {
    renderWithProviders(<TextToIslScreen />, { motionPacks: [pack] });
    await screen.findByText('All 8 signs');
    await show('Hello, how are you, teachers?');

    expect(screen.getByTestId('sentence-caption')).toHaveTextContent('Hello');
    expect(screen.getByRole('image', { name: 'Moving hand and body diagram of the signs for: Hello, How are you, Teacher' })).toBeOnTheScreen();
    for (const name of ['Hello', 'How are you', 'Teacher']) {
      expect(screen.getByRole('button', { name: `Show ${name}` })).toBeOnTheScreen(); // chip
      expect(screen.getByRole('button', { name: `Play ${name}` })).toBeOnTheScreen(); // card
    }
    expect(screen.getByRole('image', { name: 'Hand diagram of the sign for Teacher' })).toBeOnTheScreen();
    expect(screen.queryByTestId('text-to-isl-missing')).toBeNull();
    expect(screen.getByText(/ISL has its own grammar and word order/)).toBeOnTheScreen();

    // Jump to a sign; the caption says which typed word it stands for.
    fireEvent.press(screen.getByTestId('sentence-chip-2'));
    expect(screen.getByTestId('sentence-caption')).toHaveTextContent('Teacher');
    expect(screen.getByText('for “teachers”')).toBeOnTheScreen();
  });

  it('plays a sign in its card, holding the sentence still meanwhile', async () => {
    renderWithProviders(<TextToIslScreen />, { motionPacks: [pack] });
    await screen.findByText('All 8 signs');
    await show('hello teacher');
    fireEvent.press(screen.getByRole('button', { name: 'Play Teacher' }));
    expect(screen.getByRole('button', { name: 'Stop Teacher' })).toBeSelected();
    expect(screen.getByRole('image', { name: 'Moving hand and body diagram of the signs for: Teacher' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Play Hello' }));
    expect(screen.queryByRole('button', { name: 'Stop Teacher' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Stop Hello' }));
    expect(screen.getByRole('button', { name: 'Play Hello' })).toBeOnTheScreen();
  });

  it('with "reduce motion" shows a still diagram until Play is pressed', async () => {
    mockReduceMotion = true;
    renderWithProviders(<TextToIslScreen />, { motionPacks: [pack] });
    await screen.findByText('All 8 signs');
    await show('hello teacher');
    expect(screen.getByTestId('sentence-still')).toBeOnTheScreen();
    expect(screen.queryByTestId('sentence-motion')).toBeNull();
    fireEvent.press(screen.getByTestId('sentence-play'));
    expect(screen.getByTestId('sentence-motion')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
  });

  it('has controls for playing, speed, mirroring and repeating', async () => {
    renderWithProviders(<TextToIslScreen />, { motionPacks: [pack] });
    await screen.findByText('All 8 signs');
    await show('hello teacher');
    fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: '0.5×' }));
    expect(screen.getByRole('radio', { name: '0.5×' })).toBeSelected();
    fireEvent.press(screen.getByRole('button', { name: 'Mirror image' }));
    expect(screen.getByText('Mirrored')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Repeat' }));
    expect(screen.getByTestId('sentence-loop')).toBeSelected();
    fireEvent.press(screen.getByRole('button', { name: 'Next sign' }));
    expect(screen.getByTestId('sentence-caption')).toHaveTextContent('Teacher');
  });

  it('lists words without a sign instead of guessing', async () => {
    renderWithProviders(<TextToIslScreen />, { motionPacks: [pack] });
    await screen.findByText('All 8 signs');
    await show('hello is ravi, is');
    expect(screen.getByTestId('text-to-isl-missing')).toHaveTextContent(/2 words have no sign yet/);
    expect(screen.getByTestId('text-to-isl-missing')).toHaveTextContent(/“is”, “ravi”\./);
    fireEvent.press(screen.getAllByRole('button', { name: 'No sign for “is” yet' })[0]!);
    expect(screen.getByTestId('sentence-missing')).toHaveTextContent(/not among the recorded signs/);
    // Teaching your own signs is parked: nothing here leads to the recorder.
    expect(screen.queryByRole('button', { name: /Record/ })).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('completes words with signs that exist', async () => {
    renderWithProviders(<TextToIslScreen />, { motionPacks: [pack] });
    await screen.findByText('All 8 signs');
    fireEvent.changeText(screen.getByLabelText('Words or a sentence in English'), 'hello tea');
    const suggestions = screen.getByTestId('text-to-isl-suggestions');
    expect(within(suggestions).getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Use Team', 'Use Teacher']);
    fireEvent.press(within(suggestions).getByRole('button', { name: 'Use Teacher' }));
    expect(screen.getByLabelText('Words or a sentence in English').props.value).toBe('hello Teacher ');
    expect(screen.getByTestId('sentence-player')).toBeOnTheScreen();
  });

  it('offers the other recorded version of a word', async () => {
    renderWithProviders(<TextToIslScreen />, { motionPacks: [pack] });
    await screen.findByText('All 8 signs');
    await show('you');
    expect(screen.getByTestId('sentence-caption')).toHaveTextContent('You');
    fireEvent.press(screen.getByRole('button', { name: 'Other version (1 of 2)' }));
    expect(screen.getByTestId('sentence-caption')).toHaveTextContent('You (plural)');
    expect(screen.getByRole('button', { name: 'Other version (2 of 2)' })).toBeOnTheScreen();
  });

  it('shows signs recorded on this phone, and still works when the recorded signs cannot be loaded', async () => {
    const store = createMemoryStore();
    await seedSigns(store, [taughtSign({ kind: 'custom', text: 'Chai', language: 'en' }, 'knock')]);
    renderWithProviders(<TextToIslScreen />, { store, loadMotions: () => Promise.resolve([]) });
    expect(await screen.findByTestId('text-to-isl-unavailable')).toBeOnTheScreen();
    await waitFor(async () => {
      await show('chai');
      expect(screen.getByTestId('sentence-caption')).toHaveTextContent('Chai');
    });
    expect(screen.getByText('Your recording')).toBeOnTheScreen();
  });

  it('waits for the recorded signs before showing anything', async () => {
    renderWithProviders(<TextToIslScreen />, { loadMotions: () => new Promise(() => undefined) });
    expect(await screen.findByText('Loading the signs…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show signs' })).toBeDisabled();
  });

  it('saves what was looked up when history is on', async () => {
    const store = createMemoryStore({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ appLanguage: 'en', historyEnabled: true }),
    });
    renderWithProviders(<TextToIslScreen />, { store, motionPacks: [pack] });
    await screen.findByText('All 8 signs');
    await show('hello teacher');
    await act(async () => undefined);
    await waitFor(() => expect(store.data.get(HISTORY_STORAGE_KEY)).toContain('test-motion:teacher'));
  });

  it('shows words it was opened with (a recent look-up), without saving them again', async () => {
    mockParams = { text: 'hello teacher' };
    const store = createMemoryStore({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ appLanguage: 'en', historyEnabled: true }),
    });
    renderWithProviders(<TextToIslScreen />, { store, motionPacks: [pack] });
    expect(await screen.findByTestId('sentence-player')).toBeOnTheScreen();
    expect(screen.getByTestId('sentence-caption')).toHaveTextContent('Hello');
    expect(screen.getByLabelText('Words or a sentence in English').props.value).toBe('hello teacher');
    await act(async () => undefined);
    expect(store.data.get(HISTORY_STORAGE_KEY) ?? '').not.toContain('teacher');
  });
});
