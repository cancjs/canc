const config = require('./jest.config.base');

module.exports = {
	...config,
	projects: [
        "<rootDir>/packages/*/jest.config.js"
    ],
    // coverageDirectory: "<rootDir>/coverage"
};
