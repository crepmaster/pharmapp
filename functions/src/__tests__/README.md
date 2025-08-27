# Testing Guide

This directory contains tests for the Firebase Cloud Functions.

## Test Structure

### Unit Tests (`unit-tests.test.ts`, `validation.test.ts`)
- **Purpose**: Test individual functions and utilities without external dependencies
- **Requirements**: None (mocks Firebase services)
- **Run with**: `npm test -- --testPathPatterns=unit-tests.test.ts`

### Integration Tests (requires setup)
- **Purpose**: Test full function behavior with Firebase emulator
- **Files**: `payments.test.ts`, `idempotency.test.ts` (currently require emulator)
- **Requirements**: Firebase emulator running

## Running Tests

### Quick Unit Tests (No setup required)
```bash
# Run all unit tests that don't need Firebase
npm test -- --testPathPatterns="unit-tests.test.ts|validation.test.ts"

# Run a specific test file
npm test -- --testPathPatterns=validation.test.ts

# Run tests in watch mode
npm run test:watch
```

### Integration Tests (Firebase Emulator Setup Required)

1. **Start Firebase Emulator Suite**:
   ```bash
   # In the project root (not functions directory)
   firebase emulators:start --only firestore,auth
   ```

2. **Run integration tests**:
   ```bash
   npm test -- --testPathPatterns=idempotency.test.ts
   ```

## Test Files

- **`sample.test.ts`**: Basic Jest functionality test
- **`unit-tests.test.ts`**: Unit tests with mocked Firebase services
- **`validation.test.ts`**: Comprehensive validation function tests
- **`idempotency.test.ts`**: Tests idempotency utility (requires emulator)
- **`payments.test.ts`**: HTTP function tests (requires emulator)
- **`setup.ts`**: Test environment configuration

## Configuration Files

- **`jest.config.cjs`**: Jest configuration for CommonJS compatibility
- **`tsconfig.jest.json`**: TypeScript configuration for tests

## Adding New Tests

### For Unit Tests (Recommended)
1. Mock Firebase dependencies at the top of the test file
2. Import functions after mocking
3. Test function logic without external calls

### For Integration Tests
1. Use the `setup.ts` file for Firebase initialization
2. Tests will automatically clean up data after each test
3. Ensure Firebase emulator is running

## Current Test Coverage

✅ **Working Tests**:
- Validation functions (all validators)
- Business error creation
- Basic idempotency logic (mocked)
- HTTP request/response utilities

🚧 **Integration Tests** (require emulator setup):
- Payment function end-to-end tests
- Real Firestore idempotency tests
- Exchange function tests

## Tips

- Use unit tests for business logic validation
- Use integration tests for full workflow testing
- Mock external dependencies for faster, more reliable unit tests
- Keep integration tests focused on critical user workflows