// Shared jest base for examples; resolves @cancjs/* via npm file: link into dist

module.exports = {
  clearMocks: true,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/~~', '~~/'],
  modulePathIgnorePatterns: ['/~~', '~~/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    // strip .js from relative imports for Jest CJS resolver
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
