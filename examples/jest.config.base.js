// Shared jest base for examples. Unlike the monorepo jest base, examples do NOT remap
// @cancjs/* to package src — they resolve through the npm file: link into each package's built
// dist, so the smoke tests exercise the real published module shape.

module.exports = {
  clearMocks: true,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/~~', '~~/'],
  modulePathIgnorePatterns: ['/~~', '~~/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    // Shared packages are written nodenext-style (explicit .js on relative imports, resolved
    // against their .ts source by TS consumers). Jest's CJS transform needs the extension
    // stripped so its own resolver still finds the .ts file.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@shared/(.+)$': '<rootDir>/../_shared/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'es2020',
          module: 'commonjs',
          moduleResolution: 'node',
          lib: ['es2020'],
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
};
