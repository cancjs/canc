const base = require('../jest.config.base.js');

// Nest and TypeORM both rely on legacy decorator metadata (experimentalDecorators +
// emitDecoratorMetadata), so the ts-jest transform here mirrors the runtime tsconfig rather
// than the shared stage-3 default. reflect-metadata is loaded once via setupFiles so the Nest
// DI container and the metadata guard can read the emitted design types.
module.exports = {
  ...base,
  displayName: 'app-nestjs-typeorm',
  rootDir: '.',
  setupFiles: ['reflect-metadata'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'es2021',
          module: 'commonjs',
          moduleResolution: 'bundler',
          lib: ['es2022', 'dom'],
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          useDefineForClassFields: false,
          strict: false,
        },
      },
    ],
  },
};
