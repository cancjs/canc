const base = require('../jest.config.base.js');

// Two jest projects, one per flavor: each runs only that flavor's spec file, which imports the
// matching ProductDetail component directly.
function project(flavor) {
  return {
    ...base,
    displayName: `app-vue-suspense:${flavor}`,
    rootDir: '.',
    testEnvironment: 'jsdom',
    testMatch: [`<rootDir>/test/*.${flavor}.spec.ts`],
    setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
    moduleFileExtensions: ['vue', 'ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    moduleNameMapper: {
      ...base.moduleNameMapper,
      '^@shared/(.+)$': '<rootDir>/../_shared/$1',
    },
    transform: {
      '^.+\\.vue$': '@vue/vue3-jest',
      '^.+\\.tsx?$': [
        'ts-jest',
        {
          tsconfig: {
            target: 'es2020',
            module: 'commonjs',
            moduleResolution: 'node',
            lib: ['es2020', 'dom', 'dom.iterable'],
            esModuleInterop: true,
            strict: true,
          },
          isolatedModules: true,
        },
      ],
    },
  };
}

module.exports = {
  projects: [project('canc'), project('vanilla')],
};
