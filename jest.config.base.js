const path = require('path');

module.exports = {
  // cacheDirectory is intentionally set per package, not here: __dirname in this base file is the
  // monorepo root, so a value here would share one cache dir across every package's ts-jest
  // compilation, the exact race this setup avoids.
  clearMocks: true,
  collectCoverage: true,

  // NOTE: rootDir is per-package (packages/canc-*) both for standalone `jest` runs (npm test via
  // lerna) and for root multi-project runs (each project's rootDir = its package dir).
  // Glob must be relative to package rootDir, NOT prefixed with 'packages/*' (that never
  // matches, coverage silently collected 0 files, threshold never enforced; fixed).
  collectCoverageFrom: [
    'src/**/*.js',
    'src/**/*.jsx',
    'src/**/*.ts',
    'src/**/*.tsx',
    '!**/__mocks__/**',
    '!**/__tests__/**',
    '!**/*.spec.ts',
    '!**/build/**',
    '!**/dist/**',
    '!**/node_modules/**',
    '!**/~~*',
    '!**/*~~',
  ],

  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/~~', '~~$'],
  globals: {},

  // `<rootDir>` here is per-package (see rootDir note above, same hazard as
  // collectCoverageFrom).
  // A package that imports a sibling @cancjs/* package by name (e.g. canc-coroutine importing
  // @cancjs/promise) resolved to `<own-pkg>/packages/canc-promise/src`, which doesn't exist.
  // Anchor to the monorepo root (this file's own directory, always the repo root regardless of
  // which package's rootDir jest is invoked with) instead of the `<rootDir>` token.
  moduleNameMapper: {
    '^@cancjs/server-(.*)$': path.join(__dirname, 'packages/canc-server/canc-server-$1/src'),
    '^@cancjs/(.*)$': path.join(__dirname, 'packages/canc-$1/src'),
  },

  modulePathIgnorePatterns: ['/~~', '~~/'],
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/~~', '~~/'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
};
