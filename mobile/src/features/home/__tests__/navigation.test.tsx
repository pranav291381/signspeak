import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

// Relative to the Jest root (the mobile/ directory).
const APP_DIR = './src/app';
const SETTINGS_KEY = 'islconnect.settings.v1';

async function storeSettings(settings: object) {
  // Deterministic language regardless of the machine running the tests.
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ appLanguage: 'en', outputLanguage: 'en', ...settings }));
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('first launch', () => {
  it('asks for language and appearance before showing the app', async () => {
    await storeSettings({});
    const router = renderRouter(APP_DIR, { initialUrl: '/' });

    expect(await screen.findByTestId('welcome-screen')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/welcome');
    expect(screen.getByTestId('welcome-language-en')).toBeChecked();

    fireEvent.press(screen.getByTestId('welcome-next'));
    fireEvent.press(await screen.findByTestId('welcome-theme-dark'));
    expect(screen.getByTestId('welcome-theme-dark')).toBeChecked();

    fireEvent.press(screen.getByTestId('welcome-next'));
    expect(await screen.findByText(/Video never leaves your phone/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Get started' }));

    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) ?? '{}');
      expect(saved).toMatchObject({ onboardingComplete: true, theme: 'dark' });
    });
  });

  it('switches the whole app to the chosen language straight away', async () => {
    await storeSettings({});
    renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('welcome-language-hi'));
    expect(await screen.findByText('ISL Connect में आपका स्वागत है')).toBeOnTheScreen();
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) ?? '{}');
      expect(saved).toMatchObject({ appLanguage: 'hi', outputLanguage: 'hi' });
    });
    // Leave the shared i18n instance in English for other tests.
    fireEvent.press(screen.getByTestId('welcome-language-en'));
    expect(await screen.findByText('Welcome to ISL Connect')).toBeOnTheScreen();
  });
});

describe('app navigation', () => {
  beforeEach(async () => {
    await storeSettings({ onboardingComplete: true });
  });

  it('shows the main destinations on the home screen', async () => {
    renderRouter(APP_DIR, { initialUrl: '/' });

    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    for (const name of [/^Sign to text\./, /^Text to I S L\./, /^Learn I S L\./]) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
    expect(screen.getByText(/not a replacement for a qualified ISL interpreter/)).toBeOnTheScreen();
    expect(screen.getByText(/Recognition learns from you/)).toBeOnTheScreen();
  });

  it.each([
    ['home-sign-to-text', '/sign-to-text'],
    ['home-text-to-isl', '/text-to-isl'],
    ['home-learn', '/learn'],
    ['home-history', '/history'],
    ['home-teach', '/signs/teach'],
    ['home-my-signs', '/signs'],
  ])('%s opens %s', async (testID, pathname) => {
    const router = renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId(testID));
    await waitFor(() => expect(router.getPathname()).toBe(pathname));
    // Let the destination screen finish its async start-up.
    await act(async () => undefined);
  });

  it('opens the alphabet map and tips in Learn', async () => {
    renderRouter(APP_DIR, { initialUrl: '/learn' });
    expect(await screen.findByTestId('learn-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('alphabet-progress')).toHaveTextContent('0 / 26');
    expect(screen.getByRole('button', { name: 'Letter A, not recorded. Record it' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Letter Z, not recorded. Record it' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Use an interpreter when it matters' }));
    expect(await screen.findByText(/use a qualified ISL interpreter/)).toBeOnTheScreen();
  });

  it('starts recording a letter from the alphabet map', async () => {
    const router = renderRouter(APP_DIR, { initialUrl: '/learn' });
    fireEvent.press(await screen.findByTestId('letter-k'));
    await waitFor(() => expect(router.getPathname()).toBe('/signs/teach'));
    expect(await screen.findByTestId('teach-title')).toHaveTextContent('K');
  });
});
