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
const path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // rootDir and tsconfig are anchored to THIS file, so the Rules gate runs
  // identically whatever the current working directory. The preflight now runs
  // it from an isolated sandbox (so the emulator's debug log lands there, not
  // in functions/), which only works because nothing here depends on cwd.
  rootDir: __dirname,
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/firestore-rules*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: path.join(__dirname, 'tsconfig.jest.json'),
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // The emulator startup + first test boot can take a few seconds
  // on a cold cache.
  testTimeout: 30000,
};
