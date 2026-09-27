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
  /*
	globals: {
	 ...baseConfig.globals,
		'ts-jest': {
		 ...baseConfig.globals['ts-jest'],
			tsconfig: '<rootDir>/../../tsconfig.test.json'
		}
	},
 */
  transform: {
    ...mergeTsJestConfig({ tsconfig: '<rootDir>/../../tsconfig.json' }),
  },
  displayName: packageJson.name,
  // coroutine.ts coverage moved to @cancjs/coroutine jest config
  // Global entry required by ts-jest coverage instrumentation even w/ only per-file thresholds.
  coverageThreshold: {
    global: {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0,
    },
    './src/cancelable-promise.ts': {
      statements: 95,
      branches: 95,
      lines: 95,
    },
    './src/helpers.ts': {
      statements: 95,
      branches: 95,
      lines: 95,
    },
    './src/cancel-error.ts': {
      statements: 95,
      // branches capped at 90 because TS es5 __extends() fallback '|| this' is unreachable on spec Error
      branches: 90,
      lines: 95,
    },
  },
};
