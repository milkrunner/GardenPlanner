module.exports = {
  testEnvironment: 'node',
  maxWorkers: 2,
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  clearMocks: true,
  // Nur mit --coverage (npm run test:coverage) aktiv. Die V8-Coverage erfasst
  // auch die klassischen Browser-Skripte, die die Tests per vm.Script mit
  // filename in jsdom ausführen; eine Babel-/Istanbul-Instrumentierung greift
  // dort nicht.
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/**/*.js'],
  coverageReporters: ['text-summary', 'text'],
  // Mindestwerte knapp unter dem Ist-Stand (Frontend ca. 40 %, Server ca. 93 %).
  // Beim Ausbau der Tests anheben, nie absenken, um ein Gate zu umgehen.
  coverageThreshold: {
    global: { statements: 45, branches: 77, functions: 53, lines: 45 },
    './src/js/': { statements: 38, branches: 72, functions: 44, lines: 38 },
    './src/server/': { statements: 91, branches: 85, functions: 99, lines: 91 },
  },
};
