const base = require('../jest.config.base.js');

module.exports = {
 ...base,
 displayName: 'app-react-mobx',
 rootDir: '.',
 testEnvironment: 'jsdom',
 setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
 testMatch: ['<rootDir>/test/**/*.spec.ts', '<rootDir>/test/**/*.spec.tsx'],
 transform: {
 '^.+\\.(ts|tsx)$': ['ts-jest', {
 tsconfig: {
 target: 'es2020',
 module: 'commonjs',
 moduleResolution: 'node',
 lib: ['es2020', 'dom', 'dom.iterable'],
 jsx: 'react-jsx',
 esModuleInterop: true,
 strict: true,
 experimentalDecorators: false,
 useDefineForClassFields: true,
 },
 }],
 },
};
