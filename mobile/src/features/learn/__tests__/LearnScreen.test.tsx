import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import { LearnScreen } from '../LearnScreen';

// The Learn tab is parked ("In progress"); this keeps the screen working for when it returns.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('LearnScreen (parked)', () => {
  it('shows the alphabet map and opens the recorder for a missing letter', async () => {
    renderWithProviders(<LearnScreen />);
    expect(await screen.findByTestId('alphabet-progress')).toHaveTextContent('0 / 26');
    fireEvent.press(screen.getByRole('button', { name: 'Letter K, not recorded. Record it' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/teach', params: { kind: 'letter', letter: 'k' } });
  });

  it('expands a tip', async () => {
    renderWithProviders(<LearnScreen />);
    fireEvent.press(await screen.findByRole('button', { name: 'Use an interpreter when it matters' }));
    expect(screen.getByText(/use a qualified ISL interpreter/)).toBeOnTheScreen();
  });
});
