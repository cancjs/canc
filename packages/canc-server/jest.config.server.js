const path = require('path');
const baseConfig = require('../../jest.config.base');
const { mergeTsJestConfig } = require('../../jest.transform');

// Factory, not a static config: each member calls this with its own package.json so
// displayName/caching stay per-package while the socket-test settings stay uniform.
module.exports = (packageJson) => ({
  ...baseConfig,
  // process.cwd() is the member's own dir (jest always runs with cwd = the package being
  // tested); __dirname here would be this factory file's dir (packages/canc-server), shared by
  // every member and racy under parallel lerna runs, same hazard jest.config.base.js documents.
  cacheDirectory: path.join(process.cwd(), 'node_modules', '.cache', 'jest'),
  transform: {
    ...mergeTsJestConfig({ tsconfig: '<rootDir>/../../../tsconfig.json' }),
  },
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  displayName: packageJson.name,
  testEnvironment: 'node',
  // Socket tests bind real ports and wait on real 'close'/'end' events; the 5s jest default is
  // tight next to unit specs elsewhere in the monorepo.
  testTimeout: 15000,
  // real sockets on ephemeral ports contend across workers, so tighter than the shared cap
  maxWorkers: 2,
});
