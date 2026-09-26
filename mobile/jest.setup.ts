/* eslint-disable @typescript-eslint/no-require-imports */
import { configure } from '@testing-library/react-native';

// On a cold cache (always the case in CI) React Native's lazily required
// components are transformed on first render, which can exceed the 1 s default.
configure({ asyncUtilTimeout: 5000 });

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Icon fonts load asynchronously; icons are decorative, so render nothing in tests.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
