import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { HISTORY_STORAGE_KEY } from '@/history/history';
import { SETTINGS_STORAGE_KEY } from '@/settings/settings';
import { createMemoryStore } from '@/storage/keyValueStore';
import { renderWithProviders } from '@/test-utils/render';

import { TextToIslScreen } from '../TextToIslScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

async function search(text: string) {
  fireEvent.changeText(await screen.findByLabelText('Word or short phrase'), text);
  fireEvent.press(screen.getByRole('button', { name: 'Show in ISL' }));
}

beforeEach(() => mockPush.mockReset());

describe('TextToIslScreen', () => {
  it('explains that it is a phrase lookup, not sentence translation', async () => {
    renderWithProviders(<TextToIslScreen />);
    expect(await screen.findByText(/does not translate full sentences/)).toBeOnTheScreen();
  });

  it('shows a matching sign with an honest placeholder instead of an invented demonstration', async () => {
    renderWithProviders(<TextToIslScreen />);
    await search('Thank you!');
    expect(screen.getByTestId('sign-card-thank_you')).toBeOnTheScreen();
    expect(screen.getByTestId('demonstration-placeholder')).toBeOnTheScreen();
    expect(screen.getByText('Demonstration not available yet')).toBeOnTheScreen();
    expect(screen.getByText(/Not yet verified/)).toBeOnTheScreen();
  });

  it('accepts Hindi input', async () => {
    renderWithProviders(<TextToIslScreen />);
    await search('धन्यवाद');
    expect(screen.getByTestId('sign-card-thank_you')).toBeOnTheScreen();
  });

  it('says when a phrase is not in the library and labels related signs as separate', async () => {
    renderWithProviders(<TextToIslScreen />);
    await search('Thank you doctor, I need water');
    expect(screen.getByText('Not in the sign library yet')).toBeOnTheScreen();
    expect(screen.getByText(/not a translation of your sentence/)).toBeOnTheScreen();
    expect(screen.getByTestId('sign-card-doctor')).toBeOnTheScreen();
  });

  it('asks for input when empty', async () => {
    renderWithProviders(<TextToIslScreen />);
    await search('   ');
    expect(screen.getByTestId('text-to-isl-empty')).toBeOnTheScreen();
  });

  it('opens the lesson for a sign', async () => {
    renderWithProviders(<TextToIslScreen />);
    await search('water');
    fireEvent.press(screen.getByRole('button', { name: 'Open lesson' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/learn/sign/[id]', params: { id: 'water' } });
  });

  it('saves lookups only when history is turned on', async () => {
    const off = createMemoryStore();
    renderWithProviders(<TextToIslScreen />, { store: off });
    await search('water');
    expect(off.data.has(HISTORY_STORAGE_KEY)).toBe(false);
    screen.unmount();

    const on = createMemoryStore({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ historyEnabled: true }) });
    renderWithProviders(<TextToIslScreen />, { store: on });
    await search('water');
    await waitFor(() => expect(JSON.parse(on.data.get(HISTORY_STORAGE_KEY) ?? '[]')).toHaveLength(1));
    expect(JSON.parse(on.data.get(HISTORY_STORAGE_KEY)!)[0]).toMatchObject({ kind: 'lookup', text: 'water', signIds: ['water'] });
  });
});
