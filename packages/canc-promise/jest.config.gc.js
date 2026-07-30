const baseConfig = require('./jest.config.js');
const packageJson = require('./package.json');

module.exports = {
  ...baseConfig,
  displayName: `${packageJson.name} (GC)`,
  testMatch: ['**/__tests__/leak-canaries.spec.ts'],
  maxWorkers: 1,
  forceExit: true,
  detectOpenHandles: false,
};
