import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

// Relative to the Jest root (the mobile/ directory).
const APP_DIR = './src/app';

beforeEach(async () => {
  await AsyncStorage.clear();
  // Deterministic language regardless of the machine running the tests.
  await AsyncStorage.setItem('islconnect.settings.v1', JSON.stringify({ appLanguage: 'en', outputLanguage: 'en' }));
});

describe('app navigation', () => {
  it('shows the five primary destinations on the home screen', async () => {
    renderRouter(APP_DIR, { initialUrl: '/' });

    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    for (const name of [/^Sign to text\./, /^Text to I S L\./, /^Learn I S L\./, /^History\./, /^Settings\./]) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
    expect(screen.getByText(/not a replacement for a qualified ISL interpreter/)).toBeOnTheScreen();
  });

  it.each([
    ['home-sign-to-text', '/sign-to-text'],
    ['home-text-to-isl', '/text-to-isl'],
    ['home-learn', '/learn'],
    ['home-history', '/history'],
    ['home-settings', '/settings'],
  ])('%s opens %s', async (testID, pathname) => {
    const router = renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId(testID));
    expect(router.getPathname()).toBe(pathname);
    // Let the destination screen finish its async start-up (e.g. recognition session).
    await act(async () => undefined);
  });
});
