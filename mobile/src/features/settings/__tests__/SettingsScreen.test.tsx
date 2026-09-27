import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import { i18n } from '@/i18n';
import { SETTINGS_STORAGE_KEY } from '@/settings/settings';
import { createMemoryStore } from '@/storage/keyValueStore';
import { renderWithProviders } from '@/test-utils/render';
import { testPack } from '@/test-utils/packs';
import { seedSigns, taughtSign } from '@/test-utils/signs';

import { SettingsScreen } from '../SettingsScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

async function storedSettings(store: ReturnType<typeof createMemoryStore>) {
  await waitFor(() => expect(store.data.get(SETTINGS_STORAGE_KEY)).toBeDefined());
  return JSON.parse(store.data.get(SETTINGS_STORAGE_KEY) ?? '{}');
}

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('SettingsScreen', () => {
  it('switches the app language without changing the output language', async () => {
    const store = createMemoryStore();
    renderWithProviders(<SettingsScreen />, { store });

    fireEvent.press(await screen.findByTestId('app-language-hi'));

    // UI is now Hindi…
    expect(await screen.findByText('ऐप की भाषा')).toBeOnTheScreen();
    expect(screen.getByTestId('app-language-hi')).toBeChecked();
    // …but output/speech stays English.
    expect(screen.getByTestId('output-language-en')).toBeChecked();

    await waitFor(async () => {
      expect(await storedSettings(store)).toMatchObject({ appLanguage: 'hi', outputLanguage: 'en' });
    });
  });

  it('switches between system, light and dark appearance', async () => {
    const store = createMemoryStore();
    renderWithProviders(<SettingsScreen />, { store });

    expect(await screen.findByTestId('theme-system')).toBeChecked();
    fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByTestId('theme-dark')).toBeChecked();
    await waitFor(async () => {
      expect(await storedSettings(store)).toMatchObject({ theme: 'dark' });
    });
  });

  it('labels draft translations so users know they are unreviewed', async () => {
    renderWithProviders(<SettingsScreen />);
    const hindi = await screen.findByTestId('app-language-hi');
    expect(hindi.props.accessibilityLabel).toMatch(/translation awaiting review/);
  });

  it('only offers translated languages', async () => {
    renderWithProviders(<SettingsScreen />);
    await screen.findByTestId('settings-screen');
    expect(screen.queryByTestId('app-language-ta')).toBeNull();
  });

  it('keeps history and demo mode off by default and persists changes', async () => {
    const store = createMemoryStore();
    renderWithProviders(<SettingsScreen />, { store });

    const history = await screen.findByRole('switch', { name: 'Save history on this phone' });
    const demo = screen.getByRole('switch', { name: 'Demo mode' });
    expect(history).not.toBeChecked();
    expect(demo).not.toBeChecked();

    fireEvent.press(history);
    expect(screen.getByRole('switch', { name: 'Save history on this phone' })).toBeChecked();
    await waitFor(async () => expect((await storedSettings(store)).historyEnabled).toBe(true));
  });

  it('restores previously saved settings', async () => {
    const store = createMemoryStore({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ speechRate: 'slow', defaultCamera: 'front' }),
    });
    renderWithProviders(<SettingsScreen />, { store });
    expect(await screen.findByTestId('speech-rate-slow')).toBeChecked();
    expect(screen.getByTestId('default-camera-front')).toBeChecked();
  });

  it('states current limitations honestly', async () => {
    renderWithProviders(<SettingsScreen />);
    expect(await screen.findByText(/recognizes only the signs of its installed vocabulary/)).toBeOnTheScreen();
    expect(screen.getByText(/not yet been tested with many signers/)).toBeOnTheScreen();
    expect(screen.getByText(/not a replacement for a qualified ISL interpreter/)).toBeOnTheScreen();
  });

  it('credits the installed sign vocabulary and links to its source and licence', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<SettingsScreen />, { packs: [testPack([{ text: 'Hello', motion: 'wave' }])] });
    const row = await screen.findByTestId('about-vocabulary-test');
    expect(row).toHaveTextContent(/Test pack/);
    expect(row).toHaveTextContent(/Test dictionary\. Test data/);
    expect(row).toHaveTextContent(/1 sign/);
    fireEvent.press(row);
    expect(openURL).toHaveBeenCalledWith('https://example.org/');
  });

  it('says when no sign vocabulary is installed', async () => {
    renderWithProviders(<SettingsScreen />);
    expect(await screen.findByTestId('about-no-vocabulary')).toHaveTextContent('No sign vocabulary is installed in this version.');
  });

  it('has no sign-teaching section when nothing was taught', async () => {
    renderWithProviders(<SettingsScreen />);
    await screen.findByText(/not a replacement for a qualified ISL interpreter/);
    expect(screen.queryByTestId('settings-delete-signs')).toBeNull();
    expect(screen.queryByRole('button', { name: /^My signs/ })).toBeNull();
  });

  it('still lets the user delete signs taught earlier', async () => {
    const store = createMemoryStore();
    await seedSigns(store, [taughtSign({ kind: 'library', signId: 'hello' })]);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    renderWithProviders(<SettingsScreen />, { store });
    fireEvent.press(await screen.findByRole('button', { name: 'Delete all my signs. 1' }));
    await waitFor(() => expect(screen.queryByTestId('settings-delete-signs')).toBeNull());
  });
});
