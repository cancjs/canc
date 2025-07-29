const base = require('../jest.config.base.js');

module.exports = {
 ...base,
 displayName: 'app-cli-graceful',
 rootDir: '.',
 // The source uses an explicit .js extension on the dynamic import (required by the nodenext
 // typecheck). Jest resolves it through the CommonJS transform, so strip the extension back off
 // at resolve time to reach the .ts source.
 moduleNameMapper: {
 ...base.moduleNameMapper,
 '^(\\.{1,2}/.*)\\.js$': '$1',
 },
};
