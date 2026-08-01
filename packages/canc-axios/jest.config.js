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
  // Spec support code lives next to the sources it drives, and is not part of the package.
  collectCoverageFrom: [...baseConfig.collectCoverageFrom, '!**/*.helper.ts'],
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
};
