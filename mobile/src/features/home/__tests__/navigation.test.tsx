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
    expect(await screen.findByText('SignSpeak में आपका स्वागत है')).toBeOnTheScreen();
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) ?? '{}');
      expect(saved).toMatchObject({ appLanguage: 'hi', outputLanguage: 'hi' });
    });
    // Leave the shared i18n instance in English for other tests.
    fireEvent.press(screen.getByTestId('welcome-language-en'));
    expect(await screen.findByText('Welcome to SignSpeak')).toBeOnTheScreen();
    expect(screen.getByTestId('welcome-logo')).toBeOnTheScreen();
  });
});

describe('app navigation', () => {
  beforeEach(async () => {
    await storeSettings({ onboardingComplete: true });
  });

  it('puts Sign → Text first on the home screen', async () => {
    renderRouter(APP_DIR, { initialUrl: '/' });

    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Sign to text\./ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Text to I S L\./ })).toBeOnTheScreen();
    expect(screen.getByText(/not a replacement for a qualified ISL interpreter/)).toBeOnTheScreen();
    // Teaching the app your signs.
    expect(screen.getByRole('button', { name: /^Your signs\. Recognition learns from you/ })).toBeOnTheScreen();
  });

  it.each([
    ['home-sign-to-text', '/sign-to-text'],
    ['home-text-to-isl', '/text-to-isl'],
    ['home-history', '/history'],
    ['home-signs', '/my-signs'],
  ])('%s opens %s', async (testID, pathname) => {
    const router = renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId(testID));
    await waitFor(() => expect(router.getPathname()).toBe(pathname));
    // Let the destination screen finish its async start-up.
    await act(async () => undefined);
  });

  it('switches tabs from the floating tab bar, marking the chosen tab', async () => {
    const router = renderRouter(APP_DIR, { initialUrl: '/' });
    await screen.findByTestId('home-screen');
    expect(screen.getByTestId('tab-home')).toBeSelected();
    fireEvent.press(screen.getByRole('tab', { name: 'Text to I S L' }));
    await waitFor(() => expect(router.getPathname()).toBe('/text-to-isl'));
    expect(screen.getByTestId('tab-text-to-isl')).toBeSelected();
    expect(screen.getByTestId('tab-home')).not.toBeSelected();
    fireEvent.press(screen.getByTestId('tab-settings'));
    await waitFor(() => expect(router.getPathname()).toBe('/settings'));
    await act(async () => undefined);
  });

  it('lists recent activity on the home screen; a recent look-up opens in Text → ISL', async () => {
    await storeSettings({ onboardingComplete: true, historyEnabled: true });
    await AsyncStorage.setItem(
      'islconnect.history.v1',
      JSON.stringify([
        { id: 'a', kind: 'lookup', text: 'Good morning', language: 'en', signIds: [], createdAt: Date.now() },
        { id: 'b', kind: 'recognition', text: 'Thank you', language: 'en', signIds: [], createdAt: Date.now() - 1000 },
      ]),
    );
    const router = renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByTestId('home-recent')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Looked up: Good morning/ }));
    await waitFor(() => expect(router.getPathname()).toBe('/text-to-isl'));
    expect(router.getSearchParams()).toEqual({ text: 'Good morning' });
    await act(async () => undefined);
  });

  it('/text-to-isl turns typed words into signs', async () => {
    renderRouter(APP_DIR, { initialUrl: '/text-to-isl' });
    expect(await screen.findByTestId('text-to-isl-screen')).toBeOnTheScreen();
    expect(screen.getByLabelText('Words or a sentence in English')).toBeOnTheScreen();
    await act(async () => undefined);
  });

  it('My signs is a tab: teaching opens from it', async () => {
    const router = renderRouter(APP_DIR, { initialUrl: '/' });
    await screen.findByTestId('home-screen');
    fireEvent.press(screen.getByTestId('tab-my-signs'));
    expect(await screen.findByTestId('my-signs-screen')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/my-signs');
    expect(screen.getByTestId('tab-my-signs')).toBeSelected();
    expect(screen.queryByTestId('tab-learn')).toBeNull();
    fireEvent.press(screen.getByTestId('my-signs-teach'));
    await waitFor(() => expect(router.getPathname()).toBe('/signs/teach'));
    await act(async () => undefined);
  });
});
