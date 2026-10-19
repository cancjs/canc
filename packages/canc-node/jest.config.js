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
  moduleNameMapper: {
    '^@cancjs/node/fs/register-graceful$': '<rootDir>/src/fs/register-graceful.ts',
    '^@cancjs/node/fs/sync$': '<rootDir>/src/fs/sync.ts',
    '^@cancjs/node/fs/extra$': '<rootDir>/src/fs-extra/index.ts',
    '^@cancjs/node/zlib/extra$': '<rootDir>/src/zlib/extra.ts',
    '^@cancjs/node/fs$': '<rootDir>/src/fs/index.ts',
    '^@cancjs/node/child-process$': '<rootDir>/src/child-process/index.ts',
    '^@cancjs/node$': '<rootDir>/src/index.ts',
    ...baseConfig.moduleNameMapper,
  },
  cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'jest'),
  testTimeout: 15000,
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
    ...mergeTsJestConfig({ tsconfig: '<rootDir>/tsconfig.json' }),
  },
  displayName: packageJson.name,
};
