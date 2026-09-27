import { createMemoryStore } from '@/storage/keyValueStore';

import { defaultSettings, loadSettings, sanitizeSettings, saveSettings, SETTINGS_STORAGE_KEY } from '../settings';

const defaults = defaultSettings('en');

describe('defaultSettings', () => {
  it('is privacy-preserving and never enables simulated recognition', () => {
    expect(defaults.historyEnabled).toBe(false);
    expect(defaults.demoMode).toBe(false);
    expect(defaults.autoSpeak).toBe(false);
  });

  it('uses the detected language for both UI and output', () => {
    const hindi = defaultSettings('hi');
    expect(hindi.appLanguage).toBe('hi');
    expect(hindi.outputLanguage).toBe('hi');
  });
});

describe('sanitizeSettings', () => {
  it('returns defaults for non-objects', () => {
    expect(sanitizeSettings(null, defaults)).toEqual(defaults);
    expect(sanitizeSettings('nonsense', defaults)).toEqual(defaults);
  });

  it('keeps valid values and replaces invalid ones field by field', () => {
    const result = sanitizeSettings(
      { appLanguage: 'hi', outputLanguage: 'xx', speechRate: 'fast', defaultCamera: 'side', demoMode: 'yes' },
      defaults,
    );
    expect(result.appLanguage).toBe('hi');
    expect(result.outputLanguage).toBe('en');
    expect(result.speechRate).toBe('fast');
    expect(result.defaultCamera).toBe('back');
    expect(result.demoMode).toBe(false);
  });

  it('allows the app and output languages to differ', () => {
    const result = sanitizeSettings({ appLanguage: 'hi', outputLanguage: 'en' }, defaults);
    expect(result).toMatchObject({ appLanguage: 'hi', outputLanguage: 'en' });
  });

  it('accepts only known appearance choices', () => {
    expect(sanitizeSettings({ theme: 'dark' }, defaults).theme).toBe('dark');
    expect(sanitizeSettings({ theme: 'neon' }, defaults).theme).toBe('system');
  });

  it('shows the welcome again to people upgrading from a version without it', () => {
    expect(defaults.onboardingComplete).toBe(false);
    expect(sanitizeSettings({ appLanguage: 'hi' }, defaults).onboardingComplete).toBe(false);
    expect(sanitizeSettings({ onboardingComplete: true }, defaults).onboardingComplete).toBe(true);
  });

  it('rejects languages that are not yet translated', () => {
    expect(sanitizeSettings({ appLanguage: 'ta' }, defaults).appLanguage).toBe('en');
  });
});

describe('persistence', () => {
  it('round-trips through the store', async () => {
    const store = createMemoryStore();
    const custom = { ...defaults, appLanguage: 'hi' as const, historyEnabled: true };
    await saveSettings(store, custom);
    await expect(loadSettings(store, defaults)).resolves.toEqual(custom);
  });

  it('recovers from corrupted stored data', async () => {
    const store = createMemoryStore({ [SETTINGS_STORAGE_KEY]: '{not json' });
    await expect(loadSettings(store, defaults)).resolves.toEqual(defaults);
  });

  it('recovers when storage throws', async () => {
    const store = { ...createMemoryStore(), getItem: () => Promise.reject(new Error('disk')) };
    await expect(loadSettings(store, defaults)).resolves.toEqual(defaults);
  });
});
