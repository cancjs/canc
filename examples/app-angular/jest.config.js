const base = require('../jest.config.base.js');

// Frontend example: jsdom plus an Angular-aware ts-jest transform (experimentalDecorators +
// emitDecoratorMetadata, and templates stringified inline via the tsconfig). The setup file boots
// the Angular JIT test environment. See jest.setup.ts for why jest-preset-angular is not used.
module.exports = {
 ...base,
 displayName: 'app-angular',
 rootDir: '.',
 testEnvironment: 'jsdom',
 setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
 moduleFileExtensions: ['ts', 'mjs', 'js', 'json'],
 // Angular, rxjs, zone.js and tslib ship as ESM under node_modules; ts-jest must transform them
 // too (jest ignores node_modules by default), so allow-list them out of the ignore pattern.
 transformIgnorePatterns: ['node_modules/(?!(@angular|rxjs|zone\\.js|tslib|@cancjs)/)'],
 transform: {
 '^.+\\.(ts|mjs|js)$': ['ts-jest', {
 isolatedModules: true,
 tsconfig: {
 target: 'es2022',
 module: 'commonjs',
 moduleResolution: 'node',
 lib: ['es2022', 'dom', 'dom.iterable'],
 experimentalDecorators: true,
 emitDecoratorMetadata: true,
 useDefineForClassFields: false,
 esModuleInterop: true,
 allowJs: true,
 strict: false,
 },
 }],
 },
};
