const path = require('path');
const baseConfig = require('../../jest.config.base');
const packageJson = require('./package.json');

// This package compiles its sources under several conflicting TypeScript decorator modes in the
// same test run: stage-3 (TC39) native emit, experimentalDecorators legacy emit, a babel legacy
// path, and a babel stage-3 path. The runtime call shape a decorator receives (value/context for
// stage-3 vs target/key/descriptor for legacy) is baked in at emit time, so a source file emitted
// under the wrong tsconfig fails at runtime, and a stale type-check Program can emit spurious
// TS1206/TS1241 on the stage-3 matrix.
//
// ts-jest keys its compiled-output cache and language service by file path, not by the per-file
// tsconfig override layered on top, so routing every flavor through ONE ts-jest instance let a
// file compiled under one tsconfig be served to a spec expecting another. Each decorator flavor
// therefore gets its OWN jest project: a dedicated ts-jest instance, a single tsconfig, and its own
// cache dir, so no compiled output can cross between flavors. isolatedModules keeps each file on
// per-file transpile (no shared incremental Program to leak). Real type-checking for this package
// is the check:* tsc scripts and the type matrix, so dropping test-time type-checking loses no
// coverage.
function tsFlavorProject({ displayName, tsconfig, cacheName, testMatch }) {
  return {
    ...baseConfig,
    displayName,
    cacheDirectory: path.join(__dirname, 'node_modules', '.cache', cacheName),
    testMatch,
    testPathIgnorePatterns: [...baseConfig.testPathIgnorePatterns, '/babel-stage3/'],
    transform: {
      '\\.tsx?$': ['ts-jest', { tsconfig, isolatedModules: true }],
    },
  };
}

const stage3Project = tsFlavorProject({
  displayName: packageJson.name,
  tsconfig: '<rootDir>/tsconfig.stage3.json',
  cacheName: 'jest-ts-stage3',
  testMatch: ['<rootDir>/src/decorators.spec.ts'],
});

const legacyProject = tsFlavorProject({
  displayName: `${packageJson.name} (TS legacy)`,
  tsconfig: '<rootDir>/tsconfig.legacy.json',
  cacheName: 'jest-ts-legacy',
  testMatch: ['<rootDir>/src/decorators-legacy.spec.ts'],
});

const babelLegacyProject = tsFlavorProject({
  displayName: `${packageJson.name} (TS babel-legacy)`,
  tsconfig: '<rootDir>/tsconfig.babel-legacy.json',
  cacheName: 'jest-ts-babel-legacy',
  testMatch: ['<rootDir>/src/decorators-babel-legacy.spec.ts'],
});

// Non-decorator specs (subpath exports, smoke) have no decorator syntax and compile fine under the
// root tsconfig.
const smokeProject = tsFlavorProject({
  displayName: `${packageJson.name} (smoke)`,
  tsconfig: '<rootDir>/../../tsconfig.json',
  cacheName: 'jest-ts-smoke',
  testMatch: ['<rootDir>/src/subpath-exports.spec.ts'],
});

const babelJestOptions = { configFile: path.join(__dirname, 'babel.config.js') };

// Every .ts file this project touches (its own spec, the shared matrix, decorators.ts, and
// transitively @cancjs/coroutine + @cancjs/promise) goes through babel-jest exclusively via
// babel.config.js's preset-typescript + preset-env + plugin-proposal-decorators "2023-05". Giving
// this project no ts-jest transform at all keeps it fully off the ts-jest cache surface above.
const babelStage3Project = {
  ...baseConfig,
  displayName: `${packageJson.name} (babel stage-3)`,
  cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'jest-babel'),
  testMatch: ['<rootDir>/src/babel-stage3/**/*.spec.ts'],
  transform: {
    '\\.tsx?$': ['babel-jest', babelJestOptions],
  },
};

module.exports = {
  projects: [stage3Project, legacyProject, babelLegacyProject, smokeProject, babelStage3Project],
};
