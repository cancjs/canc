const base = require('../jest.config.base.js');

// MikroORM and its drivers are ESM-only and use import.meta, which does not survive jest's module
// system. So the server is never imported into the jest process: the e2e tests boot it as a real
// subprocess (native ESM) and drive it over HTTP, and jest itself stays plain commonjs. The client
// tests run the framework-free UI under jsdom with a faked axios adapter, no server at all.

const cjsTransform = {
  '^.+\\.[tj]sx?$': ['ts-jest', {
    tsconfig: {
      target: 'es2020',
      module: 'commonjs',
      moduleResolution: 'node',
      lib: ['es2020', 'dom', 'dom.iterable'],
      esModuleInterop: true,
      strict: true,
    },
  }],
};

const common = {
  moduleFileExtensions: base.moduleFileExtensions,
  moduleNameMapper: base.moduleNameMapper,
  transform: cjsTransform,
  clearMocks: true,
};

module.exports = {
  projects: [
    {
      ...common,
      displayName: 'e2e',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/e2e/**/*.spec.ts'],
    },
    {
      ...common,
      displayName: 'client',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/client/**/*.spec.ts'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.client.ts'],
    },
  ],
};
