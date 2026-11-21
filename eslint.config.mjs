import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'src/data/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs}'],
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['server.js', 'src/server/**/*.js', 'scripts/**/*.cjs', '*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['src/js/**/*.js'],
    rules: { 'no-redeclare': ['error', { builtinGlobals: false }] },
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        APP_CONFIG: 'readonly',
        GartenPlaner: 'readonly',
        Security: 'readonly',
        TaskAPI: 'readonly',
        LoggerHelpers: 'readonly',
        RateLimitHelpers: 'readonly',
        SafeStorage: 'readonly',
        SafeDOM: 'readonly',
        safeExecute: 'readonly',
        safeAsync: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
  },
  {
    // Playwright callbacks passed to page.evaluate() run inside the browser.
    files: ['tests/smoke/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
