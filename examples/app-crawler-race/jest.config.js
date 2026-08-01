const base = require('../jest.config.base.js');

// Promise.any / CancelablePromise.any need es2021+ lib; the shared base transform targets es2020.
module.exports = {
  ...base,
  displayName: 'app-crawler-race',
  rootDir: '.',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'es2020',
          module: 'commonjs',
          moduleResolution: 'node',
          lib: ['es2021', 'dom'],
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
};
