const base = require('../jest.config.base.js');

// kysely ships ESM only. Under the examples' commonjs test transform it must be transpiled too,
// so this example transforms the kysely package as well and does not ignore it.
module.exports = {
 ...base,
 displayName: 'app-express-kysely',
 rootDir: '.',
 transform: {
 '^.+\\.[tj]sx?$': ['ts-jest', {
 tsconfig: {
 target: 'es2020',
 module: 'commonjs',
 moduleResolution: 'node',
 lib: ['es2020', 'dom'],
 esModuleInterop: true,
 allowJs: true,
 strict: false,
 },
 }],
 },
 transformIgnorePatterns: ['/node_modules/(?!kysely/)'],
};
