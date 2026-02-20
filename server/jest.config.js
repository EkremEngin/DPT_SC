module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/db/**',  // Exclude database files
    '!src/scripts/**',  // Exclude scripts
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 40,
      branches: 35,
      functions: 40,
      lines: 40,
    },
    // Critical paths have higher thresholds
    './src/routes/': {
      statements: 50,
      branches: 45,
      functions: 50,
      lines: 50,
    },
    './src/services/': {
      statements: 60,
      branches: 55,
      functions: 60,
      lines: 60,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  testTimeout: 10000,
};
