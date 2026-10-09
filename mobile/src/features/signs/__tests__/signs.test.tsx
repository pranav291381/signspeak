import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { loadSigns } from '@/personal/store';
import { createMemoryStore } from '@/storage/keyValueStore';
import { renderWithProviders } from '@/test-utils/render';
import { seedSigns, taughtSign } from '@/test-utils/signs';

import { MySignsScreen } from '../MySignsScreen';
import { SignDetailScreen } from '../SignDetailScreen';

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: mockBack, navigate: jest.fn() }),
}));
jest.mock('@/accessibility/useReduceMotion', () => ({ useReduceMotion: () => true }));
const mockShare = jest.fn((_name: string, _contents: string, _title: string) => Promise.resolve(true));
const mockClearShared = jest.fn();
jest.mock('@/personal/shareFile', () => ({
  shareJsonFile: (name: string, contents: string, title: string) => mockShare(name, contents, title),
  clearSharedFiles: () => mockClearShared(),
}));

/** Confirms every dialog, pressing its confirm (last) button. */
function confirmDialogs() {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.at(-1)?.onPress?.();
  });
}

async function storeWith() {
  const store = createMemoryStore();
  await seedSigns(store, [
    taughtSign({ kind: 'library', signId: 'hello' }, 'wave', 3),
    taughtSign({ kind: 'custom', text: 'Chai', language: 'en' }, 'knock', 1),
    taughtSign({ kind: 'letter', letter: 'a' }, 'hold_fist', 2),
  ]);
  return store;
}

beforeEach(() => {
  mockParams = {};
  mockPush.mockReset();
  mockBack.mockReset();
  mockShare.mockClear();
});

describe('MySignsScreen', () => {
  it('sums up what was taught and lists words, unfinished ones first with a record button', async () => {
    renderWithProviders(<MySignsScreen />, { store: await storeWith() });
    expect(await screen.findByLabelText('2 signs ready, 6 takes, 1 of 26 letters')).toBeOnTheScreen();
    expect(screen.getByTestId('my-signs-list')).toHaveTextContent(/Hello.*App’s sign, your way · 3 takes.*Ready/);
    expect(screen.getByTestId('my-signs-unfinished')).toHaveTextContent(/Finish these.*Chai.*Your own word · 1 take/);
    expect(screen.queryByTestId('sign-row-letter:a')).toBeNull();
    expect(screen.getByTestId('alphabet-progress')).toHaveTextContent('1 / 26');

    fireEvent.press(screen.getByRole('button', { name: 'Record another take of Chai' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/teach', params: { kind: 'custom', text: 'Chai' } });
    fireEvent.press(screen.getByTestId('sign-row-custom:chai'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/[id]', params: { id: 'custom:chai' } });
    fireEvent.press(screen.getByRole('button', { name: 'Letter A' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/[id]', params: { id: 'letter:a' } });
    // Folded, the alphabet shows only the letters recorded so far.
    expect(screen.queryByRole('button', { name: 'Letter K, not recorded. Record it' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Show all 26 letters' }));
    fireEvent.press(screen.getByRole('button', { name: 'Letter K, not recorded. Record it' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/teach', params: { kind: 'letter', letter: 'k' } });
  });

  it('filters the app’s signs from your own words', async () => {
    renderWithProviders(<MySignsScreen />, { store: await storeWith() });
    fireEvent.press(await screen.findByRole('radio', { name: 'Your words' }));
    expect(screen.queryByTestId('sign-row-library:hello')).toBeNull();
    expect(screen.getByTestId('sign-row-custom:chai')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: 'App’s signs' }));
    expect(screen.getByTestId('sign-row-library:hello')).toBeOnTheScreen();
    expect(screen.queryByTestId('sign-row-custom:chai')).toBeNull();
  });

  it('searches once there are many signs', async () => {
    const store = createMemoryStore();
    const words = ['Water', 'Food', 'Doctor', 'Mother', 'Father', 'School'];
    await seedSigns(store, words.map((text) => taughtSign({ kind: 'custom', text, language: 'en' }, 'wave', 2)));
    renderWithProviders(<MySignsScreen />, { store });
    fireEvent.changeText(await screen.findByLabelText('Find a sign'), 'doc');
    expect(screen.getByTestId('sign-row-custom:doctor')).toBeOnTheScreen();
    expect(screen.queryByTestId('sign-row-custom:water')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Find a sign'), 'zebra');
    expect(screen.getByTestId('my-signs-no-matches')).toBeOnTheScreen();
  });

  it('exports the signs as a file only after the person agrees', async () => {
    const alert = confirmDialogs();
    renderWithProviders(<MySignsScreen />, { store: await storeWith() });
    fireEvent.press(await screen.findByRole('button', { name: 'Export my signs' }));
    expect(alert).toHaveBeenCalledWith('Export your signs?', expect.stringMatching(/no video/), expect.any(Array));
    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));
    const [name, contents] = mockShare.mock.calls[0]!;
    expect(name).toMatch(/^signspeak-my-signs-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(contents);
    expect(file).toMatchObject({ format: 'signspeak.my-signs', version: 1, frameDim: 156, fps: 15 });
    expect(file.signs.map((s: { id: string }) => s.id)).toEqual(['custom:chai', 'letter:a', 'library:hello']);
    alert.mockRestore();
  });

  it('says so when the file cannot be made, and the button works again', async () => {
    const alert = confirmDialogs();
    mockShare.mockRejectedValueOnce(new Error('disk full'));
    renderWithProviders(<MySignsScreen />, { store: await storeWith() });
    fireEvent.press(await screen.findByRole('button', { name: 'Export my signs' }));
    expect(await screen.findByText('The file could not be made. Please try again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Export my signs' })).toBeEnabled();
    alert.mockRestore();
  });

  it('says so when the device cannot share files', async () => {
    const alert = confirmDialogs();
    mockShare.mockResolvedValueOnce(false);
    renderWithProviders(<MySignsScreen />, { store: await storeWith() });
    fireEvent.press(await screen.findByRole('button', { name: 'Export my signs' }));
    expect(await screen.findByText('This device cannot share files.')).toBeOnTheScreen();
    alert.mockRestore();
  });

  it('invites a first sign when nothing was taught, without an export', async () => {
    renderWithProviders(<MySignsScreen />);
    expect(await screen.findByText('Teach the app your signs')).toBeOnTheScreen();
    expect(screen.queryByTestId('alphabet-grid')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export my signs' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Teach a sign' }));
    expect(mockPush).toHaveBeenCalledWith('/signs/teach');
  });

  it('deletes everything after confirmation', async () => {
    const store = await storeWith();
    const alert = confirmDialogs();
    renderWithProviders(<MySignsScreen />, { store });
    fireEvent.press(await screen.findByRole('button', { name: 'Delete all my signs' }));
    expect(alert).toHaveBeenCalled();
    expect(await screen.findByText('Teach the app your signs')).toBeOnTheScreen();
    await waitFor(async () => expect(await loadSigns(store)).toEqual([]));
    // An exported copy left in the cache goes too.
    expect(mockClearShared).toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('SignDetailScreen', () => {
  it('shows each take as a diagram and deletes a take', async () => {
    const store = await storeWith();
    const alert = confirmDialogs();
    mockParams = { id: 'library:hello' };
    renderWithProviders(<SignDetailScreen />, { store });
    expect(await screen.findByRole('image', { name: 'Hand diagram of the sign for Hello' })).toBeOnTheScreen();
    expect(screen.getByText('This sign is recognized in Sign → Text and shown in Text → ISL.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Show take 3' }));
    expect(screen.getByRole('button', { name: 'Show take 3' })).toBeSelected();
    fireEvent.press(screen.getByRole('button', { name: 'Delete take 1' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show take 3' })).toBeNull());
    expect((await loadSigns(store)).find((s) => s.id === 'library:hello')?.samples).toHaveLength(2);
    alert.mockRestore();
  });

  it('records another take of the same sign', async () => {
    mockParams = { id: 'custom:chai' };
    renderWithProviders(<SignDetailScreen />, { store: await storeWith() });
    expect(await screen.findByText(/Record 1 more take/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Record another take' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/teach', params: { kind: 'custom', text: 'Chai' } });
  });

  it('deletes the whole sign and goes back', async () => {
    const store = await storeWith();
    const alert = confirmDialogs();
    mockParams = { id: 'letter:a' };
    renderWithProviders(<SignDetailScreen />, { store });
    fireEvent.press(await screen.findByRole('button', { name: 'Delete sign' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect((await loadSigns(store)).map((s) => s.id)).not.toContain('letter:a');
    alert.mockRestore();
  });

  it('handles a sign that no longer exists', async () => {
    mockParams = { id: 'custom:gone' };
    renderWithProviders(<SignDetailScreen />);
    expect(await screen.findByTestId('sign-not-found')).toBeOnTheScreen();
  });
});
