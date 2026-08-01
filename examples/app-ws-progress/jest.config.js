const base = require('../jest.config.base.js');

module.exports = {
  ...base,
  displayName: 'app-ws-progress',
  rootDir: '.',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          ...base.transform['^.+\\.tsx?$'][1].tsconfig,
          // bundler (not classic node): classic resolution predates package.json `exports` maps,
          // so it can't see the @cancjs/coroutine/gen subpath used here.
          moduleResolution: 'bundler',
        },
      },
    ],
  },
};
