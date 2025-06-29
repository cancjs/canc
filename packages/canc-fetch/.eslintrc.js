const path = require('path');

// Universal tsconfig used by IDE TS & ESLint
module.exports = {
	extends: [
		'../../.eslintrc'
	],
	parserOptions: {
		// Relative path resolves to parent eslintrc path
		project: path.resolve(__dirname, './tsconfig.json')
	}
};
