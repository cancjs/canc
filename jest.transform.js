const baseConfig = require('./jest.config.base');

/**
 * Rebuilds the base `transform` map with extra options merged into each ts-jest entry.
 *
 * The base config names a `tsconfig` relative to the package under test, so a project whose
 * sources sit somewhere else has to override it, and overriding it means rewriting the whole
 * entry rather than one key.
 */
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

module.exports = { mergeTsJestConfig };
