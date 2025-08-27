import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ['./tsconfig.json'],
        sourceType: 'module',
        ecmaVersion: 2020,
      },
      globals: {
        // Jest globals
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Basic rules
      'no-unused-vars': 'off', // Use TypeScript version instead
      'no-console': 'off', // Allow console in Firebase functions
      'max-len': ['error', { code: 150 }], // Relaxed for Firebase/TypeScript complexity
      'no-undef': 'off', // TypeScript handles this
      
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off', // Allow any for existing Firebase code
      '@typescript-eslint/explicit-function-return-type': 'off',
      
      // Relaxed code style for this project
      'indent': 'off', // Disabled due to TypeScript complexity
      'quotes': 'off', // Allow both single and double quotes
      'semi': ['error', 'always'],
      'comma-dangle': 'off', // Allow trailing commas
    },
  },
  {
    // Ignore patterns
    ignores: [
      'lib/**/*',
      'coverage/**/*',
      '**/*.js',
      '**/*.cjs',
      'node_modules/**/*',
    ],
  },
];