const path = require('path');
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

// Two isolated Jest projects share this package's rootDir. ts-jest and babel-jest each get their
// own module registry/cache per project, so the SAME source file (src/decorators.matrix.ts, the
// stage-3 decorator-syntax matrix) can be compiled once by ts-jest (native TS 5+ emit, exercised
// via decorators.spec.ts) and once by babel-jest (@babel/plugin-proposal-decorators "2023-05" emit
// via babel-stage3/decorators.spec.ts, see ../babel.config.js) without one transform's cached
// output leaking into the other project's run.
const tsProject = {
 ...baseConfig,
 displayName: packageJson.name,
 // Explicit per-project cache dir: this package compiles the SAME filenames
 // (decorators.spec.ts, decorators.matrix.ts) under multiple different tsconfigs/transforms
 // across its own projects and across stale states between edits. The OS-tmpdir default cache
 // jest otherwise shares process-wide has been observed serving stale cross-config output after
 // a tsconfig `include` change until manually cleared (`jest --clearCache`); pin the cache dir
 // per project so a config change can't be served from another project's or another run's cache.
 cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'jest-ts'),
 testPathIgnorePatterns: [...baseConfig.testPathIgnorePatterns, '/babel-stage3/'],
 transform: {
 'decorators\\.spec\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.stage3.json' }],
 'decorators\\.matrix\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.stage3.json' }],
 'decorators-legacy\\.spec\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.legacy.json' }],
 'decorators-babel-legacy\\.spec\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.babel-legacy.json' }],
 ...mergeTsJestConfig({ tsconfig: '<rootDir>/../../tsconfig.json' })
 },
};

const babelJestOptions = { configFile: path.join(__dirname, 'babel.config.js') };

const babelStage3Project = {
 ...baseConfig,
 displayName: `${packageJson.name} (babel stage-3)`,
 cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'jest-babel'),
 testMatch: ['<rootDir>/src/babel-stage3/**/*.spec.ts'],
 // Every .ts file this project touches (its own spec, the shared matrix, decorators.ts, and
 // transitively @cancjs/coroutine + @cancjs/promise — none of the latter use decorator syntax,
 // babel.config.js's preset-typescript + preset-env handle plain TS fine) goes through babel-jest
 // exclusively. Reusing tsProject's ts-jest catchall here (even for files with no decorator
 // syntax) was observed to intermittently corrupt tsProject's OWN ts-jest Program cache across
 // runs within the same multi-project jest invocation — ts-jest's internal cache apparently keys
 // loosely enough that two projects sharing a tsconfig path (even with different per-file
 // overrides layered on top) can collide. Giving this project no ts-jest transform at all removes
 // that collision surface entirely.
 transform: {
 '\\.tsx?$': ['babel-jest', babelJestOptions],
 },
};

module.exports = {
 projects: [tsProject, babelStage3Project],
};
