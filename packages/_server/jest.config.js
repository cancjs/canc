const path = require('path');
const baseConfig = require('../../jest.config.base');

// Copy of the per-package mergeTsJestConfig helper, same shape the flat packages carry.
function mergeTsJestConfig(options) {
  return {
    ...baseConfig.transform,
    ...Object.fromEntries(
      Object.entries(baseConfig.transform)
        .filter(([, value]) => value?.[0] === 'ts-jest')
        .map(([key, [_name, baseOptions]]) => [key, ['ts-jest', { ...baseOptions, ...options }]]),
    ),
  };
}

// This inlinable directory has no package.json, so lerna never runs a suite for it. `_toolbox`
// solves that by riding along in a consuming package's `roots`; nothing consumes this directory
// yet, so it hosts its own project instead. Root `jest` picks it up through the packages/*
// projects glob.
module.exports = {
  ...baseConfig,
  cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'jest'),
  collectCoverageFrom: ['*.ts', '!*.spec.ts'],
  displayName: '_server',
  roots: ['<rootDir>'],
  transform: {
    ...mergeTsJestConfig({ tsconfig: '<rootDir>/../../tsconfig.json' }),
  },
};
