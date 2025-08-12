module.exports = {
 clearMocks: true,
 testEnvironment: 'node',
 testMatch: ['<rootDir>/test/**/*.spec.ts'],
 testPathIgnorePatterns: ['/node_modules/', '/~~', '~~/'],
 modulePathIgnorePatterns: ['/~~', '~~/'],
 moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
 moduleNameMapper: {
 '^@shared/(.+)$': '<rootDir>/_shared/$1',
 },
 transform: {
 '^.+\\.tsx?$': ['ts-jest', {
 tsconfig: {
 target: 'es2020',
 module: 'commonjs',
 moduleResolution: 'node',
 lib: ['es2020'],
 esModuleInterop: true,
 strict: true,
 },
 }],
 },
};
