import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { HISTORY_STORAGE_KEY, type HistoryEntry } from '@/history/history';
import { SETTINGS_STORAGE_KEY } from '@/settings/settings';
import { createMemoryStore } from '@/storage/keyValueStore';
import { renderWithProviders } from '@/test-utils/render';

import { HistoryScreen } from '../HistoryScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const saved: HistoryEntry[] = [
  { id: '1', kind: 'recognition', text: 'Hello', language: 'en', signIds: ['hello'], createdAt: Date.UTC(2026, 0, 2) },
  { id: '2', kind: 'lookup', text: 'water', language: 'en', signIds: ['water'], createdAt: Date.UTC(2026, 0, 1) },
];

function storeWith(historyEnabled: boolean, entries: HistoryEntry[] = saved) {
  return createMemoryStore({
    [SETTINGS_STORAGE_KEY]: JSON.stringify({ historyEnabled }),
    [HISTORY_STORAGE_KEY]: JSON.stringify(entries),
  });
}

describe('HistoryScreen', () => {
  it('explains that history is off by default and links to settings', async () => {
    const store = storeWith(false);
    renderWithProviders(<HistoryScreen />, { store });
    expect(await screen.findByTestId('history-disabled')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
    expect(mockPush).toHaveBeenCalledWith('/settings');
    // History that exists while the setting is off is deleted, as promised.
    await waitFor(() => expect(store.data.has(HISTORY_STORAGE_KEY)).toBe(false));
  });

  it('shows an empty state', async () => {
    renderWithProviders(<HistoryScreen />, { store: storeWith(true, []) });
    expect(await screen.findByTestId('history-empty')).toBeOnTheScreen();
  });

  it('lists saved entries, newest first', async () => {
    renderWithProviders(<HistoryScreen />, { store: storeWith(true) });
    const first = await screen.findByText('Hello');
    expect(first).toBeOnTheScreen();
    expect(screen.getByText('water')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Recognised sign: Hello\./)).toBeOnTheScreen();
  });

  it('clears history after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const store = storeWith(true);
    renderWithProviders(<HistoryScreen />, { store });
    fireEvent.press(await screen.findByRole('button', { name: 'Clear history' }));
    expect(alert).toHaveBeenCalledWith('Clear history?', expect.any(String), expect.any(Array));
    expect(await screen.findByTestId('history-empty')).toBeOnTheScreen();
    expect(store.data.has(HISTORY_STORAGE_KEY)).toBe(false);
    alert.mockRestore();
  });
});
