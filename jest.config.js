const config = require('./jest.config.base');

module.exports = {
  ...config,
  projects: ['<rootDir>/packages/*/jest.config.js', '<rootDir>/packages/canc-server/*/jest.config.js'],
  // coverageDirectory: "<rootDir>/coverage"
};
