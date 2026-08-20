const base = require('../jest.config.base.js');

module.exports = {
  ...base,
  displayName: 'app-invoice-scheduler-task',
  rootDir: '.',
  testEnvironment: 'jsdom',
  transform: {
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
      },
    ],
  },
};
