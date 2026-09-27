import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { frameFor, MOTIONS, perform } from '@/test-utils/landmarks';

import { SignDiagram } from '../SignDiagram';
import { SignSequencePlayer, type SequenceItem } from '../SignSequencePlayer';
import { diagramViewBox, keyFrameIndex, skeletonFrame } from '../skeleton';

jest.mock('@/accessibility/useReduceMotion', () => ({ useReduceMotion: () => false }));

beforeAll(() => {
  initI18n('en');
});


const wave = perform(MOTIONS.wave!, { durationMs: 400, restBeforeMs: 200 }).map((f) => f.values!);

describe('skeleton geometry', () => {
  it('reads body and hands from a landmark frame', async () => {
    const frame = skeletonFrame(frameFor({ right: { x: -0.3, y: 0.2, curl: [0, 0, 0, 0, 0] } }));
    expect(frame.body?.leftShoulder).toEqual([0.5, 0]);
    expect(frame.right).toHaveLength(21);
    expect(frame.right![0]![0]).toBeCloseTo(-0.3, 5);
    expect(frame.left).toBeNull();
    expect(skeletonFrame(null)).toEqual({ body: null, left: null, right: null });
  });

  it('frames the hands closely, or the upper body, at the requested aspect', async () => {
    const frames = wave.map(skeletonFrame);
    const hands = diagramViewBox(frames, 'hands', 1);
    const body = diagramViewBox(frames, 'body', 4 / 3);
    expect(hands.width).toBeCloseTo(hands.height, 6);
    expect(body.width / body.height).toBeCloseTo(4 / 3, 6);
    expect(hands.width).toBeLessThan(body.width);
    // The right hand (x ≈ -0.7 … -0.4) is inside the hands view.
    expect(hands.x).toBeLessThan(-0.7);
    expect(hands.x + hands.width).toBeGreaterThan(-0.4);
  });

  it('picks a frame with hands as the still image', async () => {
    const frames = wave.map(skeletonFrame);
    const key = keyFrameIndex(frames);
    expect(frames[key]!.right).not.toBeNull();
  });
});

describe('SignDiagram', () => {
  it('is one image for screen readers', async () => {
    render(<SignDiagram frames={wave} accessibilityLabel="Hand diagram of the sign for hello" />);
    expect(screen.getByRole('image', { name: 'Hand diagram of the sign for hello' })).toBeOnTheScreen();
  });

  it('loops and reports each completed pass', async () => {
    jest.useFakeTimers();
    const onCycle = jest.fn();
    render(<SignDiagram frames={wave} onCycle={onCycle} accessibilityLabel="x" />);
    act(() => jest.advanceTimersByTime((wave.length + 1) * (1000 / 15)));
    expect(onCycle).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('SignSequencePlayer', () => {
  const items: SequenceItem[] = [
    { key: '0', caption: 'Hello', frames: wave, kind: 'sign' },
    { key: '1', caption: 'K', frames: null, kind: 'letter', word: 'Ka' },
    { key: '2', caption: 'A', frames: wave, kind: 'letter', word: 'Ka' },
  ];

  it('plays items in order, pausing on missing recordings, and stops at the end', async () => {
    jest.useFakeTimers();
    render(<SignSequencePlayer items={items} />);
    expect(screen.getByTestId('sequence-caption')).toHaveTextContent('Hello');
    act(() => jest.advanceTimersByTime((wave.length + 1) * (1000 / 15)));
    expect(screen.getByTestId('sequence-caption')).toHaveTextContent('K');
    expect(screen.getByTestId('sequence-missing')).toBeOnTheScreen();
    act(() => jest.advanceTimersByTime(1500));
    expect(screen.getByTestId('sequence-caption')).toHaveTextContent('A');
    act(() => jest.advanceTimersByTime((wave.length + 1) * (1000 / 15)));
    expect(screen.getByRole('button', { name: 'Play again' })).toBeOnTheScreen();
    jest.useRealTimers();
  });

  it('jumps to an item and offers to record a missing one', async () => {
    const onRecordMissing = jest.fn();
    render(<SignSequencePlayer items={items} onRecordMissing={onRecordMissing} />);
    fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.press(screen.getByRole('button', { name: 'Show K' }));
    fireEvent.press(screen.getByRole('button', { name: 'Record it' }));
    expect(onRecordMissing).toHaveBeenCalledWith(items[1]);
  });
});
