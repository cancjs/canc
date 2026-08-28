const path = require('path');
const baseConfig = require('../../jest.config.base');
const { mergeTsJestConfig } = require('../../jest.transform');

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
