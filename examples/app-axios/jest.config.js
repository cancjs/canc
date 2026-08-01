export default {
  displayName: 'app-axios',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'es2020',
          module: 'esnext',
          lib: ['es2022'],
          moduleResolution: 'nodenext',
        },
      },
    ],
  },
  testMatch: ['**/*.spec.ts'],
};
