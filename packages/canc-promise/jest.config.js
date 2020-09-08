const config = require('../../jest.config.base');
const packageJson = require('./package.json');


module.exports = {
    ...config,
	globals: {
	    ...config.globals,
		'ts-jest': {
		    ...config.globals['ts-jest'],
			tsConfig: '<rootDir>/../../tsconfig.test.json'
		}
	},
    name: packageJson.name,
    displayName: packageJson.name,
};
