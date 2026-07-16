const base = require('../jest.config.base.js');

// Two jest projects, one per flavor: each runs only that flavor's spec file, which imports the
// matching store module directly.
function project(flavor) {
 return {
 ...base,
 displayName: `app-vue-pinia:${flavor}`,
 rootDir: '.',
 testEnvironment: 'jsdom',
 testMatch: [`<rootDir>/test/*.${flavor}.spec.ts`],
 setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
 moduleFileExtensions: ['vue', 'ts', 'tsx', 'js', 'jsx', 'json', 'node'],
 moduleNameMapper: {
 ...base.moduleNameMapper,
 '^@shared/(.+)$': '<rootDir>/../_shared/$1',
 // pinia's diagnostics reporter (nostics) and devtools integration ship ESM-only with no
 // CJS build anywhere in their dependency chain (nostics, @vue/devtools-kit,
 // perfect-debounce). Neither is part of the store behavior under test, so both are
 // stubbed instead of chasing the ESM chain through jest's CJS transform.
 '^nostics$': '<rootDir>/test/__mocks__/nostics-stub.js',
 '^@vue/devtools-api$': '<rootDir>/test/__mocks__/devtools-api-stub.js',
 },
 transform: {
 '^.+\\.vue$': '@vue/vue3-jest',
 '^.+\\.tsx?$': ['ts-jest', {
 tsconfig: {
 target: 'es2020',
 module: 'commonjs',
 moduleResolution: 'node',
 lib: ['es2020', 'dom', 'dom.iterable'],
 esModuleInterop: true,
 strict: true,
 },
 isolatedModules: true,
 }],
 // pinia's own build ships ESM-only (no CJS export); ts-jest also transforms its plain .js
 // output down to commonjs so jest's runtime can require() it like everything else.
 'node_modules[\\\\/]pinia[\\\\/].+\\.js$': ['ts-jest', {
 tsconfig: { target: 'es2020', module: 'commonjs', allowJs: true },
 isolatedModules: true,
 }],
 },
 transformIgnorePatterns: ['/node_modules/(?!pinia/)'],
 };
}

module.exports = {
 projects: [project('canc'), project('vanilla')],
};
