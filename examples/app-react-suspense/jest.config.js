const base = require('../jest.config.base.js');

// Frontend example: jsdom environment plus a tsx transform (jsx + dom lib) for the React specs.
module.exports = {
  ...base,
  displayName: 'app-react-suspense',
  rootDir: '.',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'es2020',
          module: 'commonjs',
          moduleResolution: 'node',
          jsx: 'react-jsx',
          lib: ['es2020', 'dom', 'dom.iterable'],
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
};
