const base = require('../jest.config.base.js');

// Two jest projects, one per flavor, mirroring vite's --mode split: each maps the
// `@/stores/checkout` alias the shared step components/router import to that flavor's store file.
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
 '^@shared/(.+)$': '<rootDir>/../_shared/$1',
 '^@/stores/checkout$': `<rootDir>/src/stores/checkout-${flavor}.ts`,
 '^@/(.*)$': '<rootDir>/src/$1',
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
 },
 };
}

module.exports = {
 projects: [project('canc'), project('vanilla')],
};
