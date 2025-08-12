const base = require('../../jest.config.base.js');

module.exports = {
 ...base,
 displayName: 'mock-api',
 rootDir: '.',
 // Base maps @shared/* one level up from rootDir, but this package already lives inside
 // _shared/, one level deeper than the example dirs the base config assumes.
 moduleNameMapper: {
 '^@shared/(.+)$': '<rootDir>/../$1',
 },
};
