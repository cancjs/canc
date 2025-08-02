const base = require('../jest.config.base.js');

// Frontend example: jsdom environment plus a tsx transform (jsx + dom lib) for the React specs.
module.exports = {
 ...base,
 displayName: 'app-react',
 rootDir: '.',
 testEnvironment: 'jsdom',
 testMatch: ['<rootDir>/src/**/*.spec.tsx'],
 setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
 // The examples yarn root also hosts a React 19 example, so pin this example's React to its own
 // nested copy — otherwise jest hoisting mixes two React versions and rendering fails.
 moduleNameMapper: {
 ...base.moduleNameMapper,
 '^react$': '<rootDir>/node_modules/react',
 '^react-dom$': '<rootDir>/node_modules/react-dom',
 '^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
 '^react/(.*)$': '<rootDir>/node_modules/react/$1',
 },
 transform: {
 '^.+\\.[tj]sx?$': ['ts-jest', {
 tsconfig: {
 target: 'es2020',
 module: 'commonjs',
 moduleResolution: 'node',
 jsx: 'react-jsx',
 lib: ['es2020', 'dom', 'dom.iterable'],
 esModuleInterop: true,
 strict: true,
 },
 }],
 },
};
