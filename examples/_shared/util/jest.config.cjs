const base = require('../../jest.config.base.js');

module.exports = {
  ...base,
  displayName: 'shared-util',
  rootDir: '.',
  moduleNameMapper: {
    '^@shared/(.+)$': '<rootDir>/../$1',
  },
};
