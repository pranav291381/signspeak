import { fireEvent, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

import { renderWithProviders } from '@/test-utils/render';

import { FeedbackScreen } from '../FeedbackScreen';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

beforeEach(() => {
  mockParams = {};
});

describe('FeedbackScreen', () => {
  it('warns against personal details and shows exactly what is included', async () => {
    renderWithProviders(<FeedbackScreen serverUrl={null} />);
    expect(await screen.findByText(/do not include names, phone numbers/)).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-included')).toHaveTextContent(/App version .*app language en, output language en/);
  });

  it('is pre-filled when reporting a wrong recognition result', async () => {
    mockParams = { feature: 'sign_to_text', issue: 'wrong_recognition', label: 'water', simulated: 'true' };
    renderWithProviders(<FeedbackScreen serverUrl={null} />);
    expect(await screen.findByTestId('feedback-feature-sign_to_text')).toBeChecked();
    expect(screen.getByTestId('feedback-issue-wrong_recognition')).toBeChecked();
    expect(screen.getByText('The recognised sign: water (demo mode, simulated).')).toBeOnTheScreen();
  });

  it('requires a description before sharing', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    renderWithProviders(<FeedbackScreen serverUrl={null} />);
    fireEvent.press(await screen.findByRole('button', { name: 'Share report' }));
    expect(screen.getByTestId('feedback-description-error')).toBeOnTheScreen();
    expect(share).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Describe the problem'), 'The text is too small');
    fireEvent.press(screen.getByRole('button', { name: 'Share report' }));
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('The text is too small') });
    share.mockRestore();
  });

  it('only offers sending when a project server is configured', async () => {
    renderWithProviders(<FeedbackScreen serverUrl={null} />);
    await screen.findByTestId('feedback-screen');
    expect(screen.queryByTestId('feedback-send')).toBeNull();
  });

  it('tells the user when the phone is offline and nothing was sent', async () => {
    const fetchImpl = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
    renderWithProviders(<FeedbackScreen serverUrl="https://pilot.example" fetchImpl={fetchImpl} />);
    fireEvent.changeText(await screen.findByLabelText('Describe the problem'), 'Crashed on start');
    fireEvent.press(screen.getByRole('button', { name: 'Send to project team' }));
    expect(await screen.findByTestId('feedback-offline')).toHaveTextContent(/No internet connection/);
  });

  it('confirms with a reference when sent', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve({ status: 201, json: () => Promise.resolve({ report_id: 'r-42' }) } as Response),
    );
    renderWithProviders(<FeedbackScreen serverUrl="https://pilot.example" fetchImpl={fetchImpl} />);
    fireEvent.changeText(await screen.findByLabelText('Describe the problem'), 'Crashed on start');
    fireEvent.press(screen.getByRole('button', { name: 'Send to project team' }));
    expect(await screen.findByText('Thank you. Report sent. Reference: r-42')).toBeOnTheScreen();
  });
});
