// Shared jest base for examples. Unlike the monorepo jest base, examples do NOT remap
// @cancjs/* to package src — they resolve through the yarn link into each package's built
// dist, so the smoke tests exercise the real published module shape.

module.exports = {
 clearMocks: true,
 testEnvironment: 'node',
 roots: ['<rootDir>/src', '<rootDir>/test'],
 testPathIgnorePatterns: ['/node_modules/', '/~~', '~~/'],
 modulePathIgnorePatterns: ['/~~', '~~/'],
 transform: {
 '^.+\\.tsx?$': ['ts-jest', {
 tsconfig: {
 target: 'es2020',
 module: 'commonjs',
 moduleResolution: 'node',
 esModuleInterop: true,
 strict: true,
 },
 }],
 },
};
