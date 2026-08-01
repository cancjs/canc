const path = require('path');
const baseConfig = require('../../jest.config.base');
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
  // The inlinable `_toolbox` directory has no package.json, so lerna never runs a suite for it and
  // its specs need a host project. This package is that host: it consumes every `_toolbox` module
  // and already compiles them from source.
  roots: [...baseConfig.roots, '<rootDir>/../_toolbox'],
  transform: {
    ...mergeTsJestConfig({ tsconfig: '<rootDir>/../../tsconfig.json' }),
  },
  displayName: packageJson.name,
};
