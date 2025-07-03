const baseConfig = require('../../jest.config.base');
const packageJson = require('./package.json');

function mergeTsJestConfig(options) {
 return {
 ...baseConfig.transform,
 ...Object.fromEntries(
 Object.entries(baseConfig.transform)
 .filter(([, value]) => value?.[0] === 'ts-jest')
 .map(([key, [name, baseOptions]]) => [key, ['ts-jest', { ...baseOptions, ...options }]])
 )
 };
}

module.exports = {
 ...baseConfig,
 transform: {
 'decorators\\.spec\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.stage3.json' }],
 'decorators-legacy\\.spec\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.legacy.json' }],
 'decorators-babel-legacy\\.spec\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.babel-legacy.json' }],
 ...mergeTsJestConfig({ tsconfig: '<rootDir>/../../tsconfig.json' })
 },
 displayName: packageJson.name,
};
