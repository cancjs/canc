const base = require('../jest.config.base.js');

// Frontend example: jsdom environment, plus a .vue transform (@vue/vue3-jest) alongside a ts-jest
// transform for the specs. ts-jest runs in isolatedModules mode so a `.vue` import (whose types
// come from the SFC, not a .d.ts ts-jest can see) does not trip module-resolution type-checking.
module.exports = {
  ...base,
  displayName: 'app-vue',
  rootDir: '.',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: [...base.moduleFileExtensions, 'vue'],
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
          isolatedModules: true,
        },
      },
    ],
  },
};
