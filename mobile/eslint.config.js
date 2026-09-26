// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // public/mediapipe holds third-party files copied at install time.
    ignores: ['dist/*', 'coverage/*', 'public/mediapipe/*'],
  },
  {
    files: ['src/**/*.tsx'],
    rules: {
      // All user-facing text must come from localization files (t("…")).
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'react/jsx-no-literals': 'off',
    },
  },
]);
