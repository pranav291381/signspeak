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

/** Confirms every dialog, pressing its destructive button. */
function confirmDialogs() {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
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
});

describe('MySignsScreen', () => {
  it('lists taught words with their readiness, and counts letters separately', async () => {
    renderWithProviders(<MySignsScreen />, { store: await storeWith() });
    expect(await screen.findByTestId('sign-row-library:hello')).toHaveTextContent(/Hello.*3 takes.*Ready/);
    expect(screen.getByTestId('sign-row-custom:chai')).toHaveTextContent(/Chai.*1 take.*Needs 1 more/);
    expect(screen.queryByTestId('sign-row-letter:a')).toBeNull();
    expect(screen.getByRole('button', { name: /^Alphabet\. 1 \/ 26/ })).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('sign-row-custom:chai'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/[id]', params: { id: 'custom:chai' } });
  });

  it('shows an empty state and deletes everything after confirmation', async () => {
    const store = await storeWith();
    const alert = confirmDialogs();
    renderWithProviders(<MySignsScreen />, { store });
    fireEvent.press(await screen.findByRole('button', { name: 'Delete all my signs' }));
    expect(alert).toHaveBeenCalled();
    expect(await screen.findByText('No signs yet')).toBeOnTheScreen();
    await waitFor(async () => expect(await loadSigns(store)).toEqual([]));
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
