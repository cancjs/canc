const base = require('../jest.config.base.js');

module.exports = {
 ...base,
 displayName: 'app-react-zustand',
 rootDir: '.',
 testEnvironment: 'jsdom',
 testMatch: ['<rootDir>/src/**/*.spec.tsx', '<rootDir>/test/**/*.spec.tsx'],
 setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
 transform: {
 '^.+\\.tsx?$': ['ts-jest', {
 tsconfig: {
 target: 'es2020',
 module: 'commonjs',
 moduleResolution: 'node',
 lib: ['es2020', 'dom', 'dom.iterable'],
 jsx: 'react-jsx',
 esModuleInterop: true,
 strict: true,
 },
 }],
 },
};
