import { fireEvent, screen } from '@testing-library/react-native';

import type { SessionSnapshot } from '@/recognition/session';
import { renderWithProviders } from '@/test-utils/render';

import { RecognitionPanel } from '../RecognitionPanel';

const snapshot = (patch: Partial<SessionSnapshot>): SessionSnapshot => ({
  state: 'running',
  status: 'analyzing',
  simulated: false,
  recognizer: { id: 'test', kind: 'on_device', version: '1', labels: [], calibrated: false, featureSpecVersion: 1, windowSize: 32 },
  ...patch,
});

const suggestions = [
  { label: 'test:water', text: 'Water' },
  { label: 'test:hello', text: 'Hello' },
];

describe('RecognitionPanel', () => {
  it('offers the likeliest signs when not sure; one tap picks one', async () => {
    const onChoose = jest.fn();
    renderWithProviders(
      <RecognitionPanel
        snapshot={snapshot({ status: 'uncertain', reason: 'low_confidence', suggestions: ['test:water', 'test:hello'] })}
        paused={false}
        latest={null}
        transcript={[]}
        suggestions={suggestions}
        onChoose={onChoose}
      />,
    );
    expect(await screen.findByText('Did you mean…?')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Choose Hello' }));
    expect(onChoose).toHaveBeenCalledWith('test:hello');
  });

  it('offers other likely signs under a recognized one, to fix a wrong result', async () => {
    const onChoose = jest.fn();
    renderWithProviders(
      <RecognitionPanel
        snapshot={snapshot({ status: 'recognized', suggestions: ['test:water', 'test:hello'] })}
        paused={false}
        latest={{ recognition: { label: 'test:tea', band: null, timestampMs: 1 }, text: 'Tea', emergency: false }}
        transcript={[]}
        suggestions={suggestions}
        onChoose={onChoose}
      />,
    );
    expect(await screen.findByText('Not right?')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Choose Water instead' }));
    expect(onChoose).toHaveBeenCalledWith('test:water');
  });

  it('shows no suggestions while watching', async () => {
    renderWithProviders(
      <RecognitionPanel snapshot={snapshot({ status: 'analyzing' })} paused={false} latest={null} transcript={[]} suggestions={suggestions} onChoose={jest.fn()} />,
    );
    expect(await screen.findByTestId('recognition-status')).toBeOnTheScreen();
    expect(screen.queryByTestId('recognition-suggestions')).toBeNull();
  });

  it('tells people to lower their hands after each sign when whole signs are recognized', async () => {
    const recognizer = { ...snapshot({}).recognizer, mode: 'segment' as const };
    renderWithProviders(<RecognitionPanel snapshot={snapshot({ recognizer })} paused={false} latest={null} transcript={[]} />);
    expect(await screen.findByText('Make one sign at a time, then lower your hands.')).toBeOnTheScreen();
  });

  it('says when a word was chosen from the suggestions rather than recognized', async () => {
    renderWithProviders(
      <RecognitionPanel
        snapshot={snapshot({ status: 'recognized' })}
        paused={false}
        latest={{ recognition: { label: 'test:hello', band: null, timestampMs: 1, chosen: true }, text: 'Hello', emergency: false }}
        transcript={[]}
      />,
    );
    expect(await screen.findByTestId('recognition-text')).toHaveTextContent('Hello');
    expect(screen.getByText('Chosen from the suggestions')).toBeOnTheScreen();
  });
});
