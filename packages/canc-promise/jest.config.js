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
 ...mergeTsJestConfig({ tsconfig: '<rootDir>/../../tsconfig.json' })
 },
 displayName: packageJson.name,
 // coverage gate. coroutine.ts moved out to @cancjs/coroutine — its
 // own coverage lives in that package's jest config now.
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
 // branches capped at 90 (not 95): TS es5 target compiles `class CancelError extends Error`
 // via the __extends() helper's `_super.call(this, reason) || this` fallback — the `|| this`
 // side is dead by spec (Error's [[Call]] always returns an object, so _super.call(...) is
 // always truthy; the fallback only matters for non-spec-compliant engines). Same class of
 // structural artifact as the Q1-Q4 quirks in .claude/code-review.md. Verified both logical
 // sides of every other branch in this file ARE exercised (see cancel-error.spec.ts).
 branches: 90,
 lines: 95,
 },
 },
};
