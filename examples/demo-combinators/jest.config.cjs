module.exports = {
  displayName: 'demo-combinators',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../_shared/$1',
  },
};
