/**
 * Sprint 2A.1 — Firestore rules tests Jest config.
 *
 * Runs ONLY `src/__tests__/firestore-rules.test.ts` against the
 * Firestore emulator. Invoked via `npm run test:rules`, which wraps
 * Jest with `firebase emulators:exec --only firestore` so the emulator
 * is spun up and torn down automatically.
 *
 * Kept separate from `jest.config.cjs` so the standard `npm test`
 * suite stays runnable without Java or the Firebase emulator (CI
 * environments may not have them).
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/firestore-rules*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // The emulator startup + first test boot can take a few seconds
  // on a cold cache.
  testTimeout: 30000,
};
