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
