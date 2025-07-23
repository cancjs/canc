// Aggregate runner for all example smoke suites. Each example ships its own jest.config.js
// extending ./jest.config.base.js; this root config runs them as jest projects.
module.exports = {
 projects: ['<rootDir>/_shared/mock-api', '<rootDir>/demo-promise-basics', '<rootDir>/demo-chain-propagation', '<rootDir>/demo-coroutine', '<rootDir>/demo-decorators', '<rootDir>/demo-fetch', '<rootDir>/demo-toolbox', '<rootDir>/demo-combinators', '<rootDir>/demo-async-dispose', '<rootDir>/demo-lazy-promise', '<rootDir>/demo-signal-interop'],
};
