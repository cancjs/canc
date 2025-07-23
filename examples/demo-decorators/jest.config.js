const path = require('path');
const base = require('../jest.config.base.js');

// Each decorator flavor needs a different decorator emit. Stage-3 (and the plain shared/spec files)
// compile with ts-jest, experimentalDecorators OFF. The TS-legacy and babel-legacy flavors both
// need legacy decorator emit, so both go through babel-jest with @babel/plugin-proposal-decorators
// (legacy: true). One spec file imports all four flavors, so a second ts-jest config in the same
// project would share ts-jest's compiler cache with the stage-3 config and collide; routing the
// legacy flavor through babel-jest keeps the two emits cleanly apart. Runtime start scripts still
// exercise the real tsc legacy path (see start:legacy and src/ts-legacy/tsconfig.json).
const tsStage3 = {
 target: 'es2020',
 module: 'commonjs',
 moduleResolution: 'node',
 esModuleInterop: true,
 strict: true,
 experimentalDecorators: false,
 useDefineForClassFields: false,
};

const babelLegacyTs = {
 presets: [
 ['@babel/preset-env', { targets: { node: 'current' } }],
 ['@babel/preset-typescript', {}],
 ],
 plugins: [['@babel/plugin-proposal-decorators', { legacy: true }]],
};

const babelLegacyJs = {
 presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
 plugins: [['@babel/plugin-proposal-decorators', { legacy: true }]],
};

module.exports = {
 ...base,
 displayName: 'demo-decorators',
 rootDir: '.',
 cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'jest'),
 // The source uses explicit .js extensions on relative imports (required by the nodenext
 // typecheck). Jest resolves these files through the CommonJS transform, so strip the extension
 // back off at resolve time to reach the .ts/.js sources.
 moduleNameMapper: {
 ...base.moduleNameMapper,
 '^(\\.{1,2}/.*)\\.js$': '$1',
 },
 transform: {
 '[/\\\\]ts-legacy[/\\\\].*\\.ts$': ['babel-jest', babelLegacyTs],
 '[/\\\\]babel-legacy[/\\\\].*\\.js$': ['babel-jest', babelLegacyJs],
 // Everything else that is not a legacy flavor: stage-3 emit (experimentalDecorators off).
 '^(?!.*[/\\\\](?:ts|babel)-legacy[/\\\\]).*\\.ts$': ['ts-jest', { tsconfig: tsStage3 }],
 },
 transformIgnorePatterns: [],
};
