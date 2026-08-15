const path = require('path');
const baseConfig = require('../jest.config.base');
const packageJson = require('./package.json');

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
  transform: {
    ...mergeTsJestConfig({ tsconfig: '<rootDir>/../tsconfig.test.json' }),
  },
  // This lane must resolve packages the way a consumer does, never through the source alias that
  // the base config provides for the source test lane.
  moduleNameMapper: {},
  // Coverage is for the source lane; the built output is tested for integration only.
  collectCoverage: false,
  displayName: packageJson.name,
};
