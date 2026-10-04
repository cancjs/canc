const path = require('path');
const baseConfig = require('../../jest.config.base');
const { mergeTsJestConfig } = require('../../jest.transform');

// This directory holds no package.json on purpose: it is inlined into the five server packages
// rather than published, which also puts it outside every workspace glob, so lerna cannot run a
// suite for it. The config lives here anyway, next to the sources it compiles, and the node adapter
// lists it as one of its jest projects so `npm test` at the root still runs these specs.
module.exports = {
  ...baseConfig,
  cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'jest'),
  collectCoverageFrom: ['*.ts', '!*.spec.ts'],
  displayName: '_server',
  roots: ['<rootDir>'],
  // narrower than the default so __tests__ can hold shared fakes without each one counting as a suite
  testMatch: ['<rootDir>/*.spec.ts'],
  transform: {
    ...mergeTsJestConfig({ tsconfig: '<rootDir>/../../tsconfig.json' }),
  },
};
