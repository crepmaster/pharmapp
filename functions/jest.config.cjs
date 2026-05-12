module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  // Sprint 2A.1: Firestore rules tests require the emulator (Java) and
  // are run via the dedicated `npm run test:rules` script with
  // `jest.rules.config.cjs`. They are excluded from the default suite
  // so `npm test` stays runnable without Java / emulator.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/lib/',
    '/__tests__/firestore-rules\\.test\\.ts$'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json'
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
};