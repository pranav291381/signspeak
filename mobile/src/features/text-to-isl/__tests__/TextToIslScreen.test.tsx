import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { HISTORY_STORAGE_KEY } from '@/history/history';
import { SETTINGS_STORAGE_KEY } from '@/settings/settings';
import { createMemoryStore } from '@/storage/keyValueStore';
import { renderWithProviders } from '@/test-utils/render';
import { seedSigns, taughtSign } from '@/test-utils/signs';

import { planSigns } from '../plan';
import { TextToIslScreen } from '../TextToIslScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/accessibility/useReduceMotion', () => ({ useReduceMotion: () => false }));

const hello = taughtSign({ kind: 'library', signId: 'hello' });
const letters = ['r', 'a', 'v', 'i'].map((letter) => taughtSign({ kind: 'letter', letter }, 'hold_fist', 1));
const chai = taughtSign({ kind: 'custom', text: 'Chai', language: 'en' }, 'knock');
const all = [hello, ...letters, chai];
const byId = (signs: typeof all) => (id: string) => signs.find((s) => s.id === id);

async function show(text: string) {
  fireEvent.changeText(await screen.findByLabelText('Words to sign'), text);
  fireEvent.press(screen.getByRole('button', { name: 'Show signs' }));
}

beforeEach(() => mockPush.mockReset());

describe('planSigns', () => {
  it('matches whole phrases first, then words, then fingerspells', () => {
    const plan = planSigns('Hello! How are you, Ravi?', all, byId(all), 'en')!;
    expect(plan.items.map((i) => [i.caption, i.kind])).toEqual([
      ['Hello', 'sign'],
      ['How are you?', 'sign'],
      ['R', 'letter'],
      ['A', 'letter'],
      ['V', 'letter'],
      ['I', 'letter'],
    ]);
    expect(plan.items.find((i) => i.caption === 'R')?.word).toBe('ravi');
    // "How are you" has not been recorded.
    expect(plan.missing).toBe(1);
  });

  it('uses signs the user taught, Hindi phrases, and digits', () => {
    const plan = planSigns('chai नमस्ते 25', all, byId(all), 'hi')!;
    expect(plan.items.map((i) => i.caption)).toEqual(['Chai', 'नमस्ते', '2', '5']);
    expect(plan.items[0]!.frames).not.toBeNull();
    expect(plan.items[1]!.frames).not.toBeNull();
    expect(plan.items[2]!.target).toEqual({ kind: 'library', signId: 'number_2' });
  });

  it('marks words it cannot sign or spell as missing instead of guessing', () => {
    const plan = planSigns('किताब', all, byId(all), 'hi')!;
    expect(plan.items).toEqual([expect.objectContaining({ caption: 'किताब', frames: null, target: null })]);
    expect(planSigns('  ?! ', all, byId(all), 'en')).toBeNull();
  });
});

describe('TextToIslScreen', () => {
  it('explains where diagrams come from before anything is typed', async () => {
    renderWithProviders(<TextToIslScreen />);
    expect(await screen.findByText(/Each diagram is a sign recorded on this phone/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Record the alphabet' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/teach', params: { kind: 'alphabet' } });
  });

  it('asks for text when the input is empty', async () => {
    renderWithProviders(<TextToIslScreen />);
    await show('   ');
    expect(screen.getByTestId('text-to-isl-empty')).toBeOnTheScreen();
  });

  it('plays recorded signs and fingerspelling as diagrams, with an honest grammar note', async () => {
    const store = createMemoryStore();
    await seedSigns(store, all);
    renderWithProviders(<TextToIslScreen />, { store });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show Chai' })).toBeOnTheScreen());

    await show('hello ravi');
    expect(screen.getByTestId('sequence-diagram')).toBeOnTheScreen();
    expect(screen.getByTestId('sequence-caption')).toHaveTextContent('Hello');
    expect(screen.queryByTestId('text-to-isl-missing')).toBeNull();
    expect(screen.getByText(/ISL has its own grammar and word order/)).toBeOnTheScreen();
    for (const letter of ['R', 'A', 'V', 'I']) {
      expect(screen.getByRole('button', { name: `Show ${letter}` })).toBeOnTheScreen();
    }
  });

  it('shows what has not been recorded and opens the recorder for it', async () => {
    renderWithProviders(<TextToIslScreen />);
    await show('thank you');
    expect(screen.getByTestId('text-to-isl-missing')).toHaveTextContent(/1 sign or letter has not been recorded/);
    expect(screen.getByTestId('sequence-missing')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Record it' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/signs/teach', params: { kind: 'library', id: 'thank_you' } });
  });

  it('saves what was looked up when history is on', async () => {
    const store = createMemoryStore({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ appLanguage: 'en', historyEnabled: true }),
    });
    renderWithProviders(<TextToIslScreen />, { store });
    await show('water');
    await act(async () => undefined);
    await waitFor(() => expect(store.data.get(HISTORY_STORAGE_KEY)).toContain('water'));
  });
});
