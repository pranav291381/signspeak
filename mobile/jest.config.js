/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testTimeout: 20000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.signpack$': '<rootDir>/src/test-utils/assetStub.js',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/app/**'],
};
