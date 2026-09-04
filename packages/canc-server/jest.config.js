const path = require('path');
const baseConfig = require('../../jest.config.base');
const { mergeTsJestConfig } = require('../../jest.transform');

// The end-to-end suite for the whole family, one level above its members. It exercises all five
// packages against real sockets in one file, so it belongs to none of them and rides in its own
// project here, the way the shared core does. Members keep their own configs, built from
// jest.config.server.js; this file is not that factory.
//
// Root `jest` picks this up through the packages/* projects glob. `lerna run test` cannot, since
// this directory carries no package.json and so is no workspace; the node adapter's config lists it
// as one of its projects instead, which is what keeps the suite in the root `npm test` lane.
module.exports = {
  ...baseConfig,
  cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'jest'),
  // the members measure their own coverage; the glob here would resolve against this directory,
  // which holds no sources of its own
  collectCoverage: false,
  displayName: 'server-smoke',
  // one worker and one file: every test binds a port and drops connections mid-flight, so nothing
  // is gained by contending with itself
  maxWorkers: 1,
  roots: ['<rootDir>'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/*.spec.ts'],
  testPathIgnorePatterns: [...baseConfig.testPathIgnorePatterns, '/dist/', '/coverage/'],
  // real listeners, real disconnects and a shutdown grace window each cost wall time
  testTimeout: 20000,
  transform: {
    ...mergeTsJestConfig({ tsconfig: '<rootDir>/../../tsconfig.json' }),
  },
};
