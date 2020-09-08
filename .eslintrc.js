'use strict';

module.exports = {
	extends: [
		'xo'
	],
	overrides: [
		{
			files: ['*.js', '*.jsx'],
			rules: {
				'@typescript-eslint/no-var-requires': 'off',
				'prefer-object-spread': 'off'
			}
		},
		{
			files: ['*.ts', '*.tsx'],
			extends: [
				'xo-typescript'
			],
			rules: {
				// Core already checked by TypeScript
				'getter-return': 'off',
				'no-dupe-args': 'off',
				'no-dupe-keys': 'off',
				'no-unreachable': 'off',
				'valid-typeof': 'off',
				'no-const-assign': 'off',
				'no-new-symbol': 'off',
				'no-this-before-super': 'off',
				'no-undef': 'off',
				'no-dupe-class-members': 'off',
				'no-redeclare': 'off',
				'quotes': 'off',

				// @typescript-eslint
				'@typescript-eslint/array-type': 'off',
				'@typescript-eslint/ban-types': ['error', {
					extendDefaults: false,
					types: {
						String: {
							message: 'Use `string` instead.',
							fixWith: 'string'
						},
						Number: {
							message: 'Use `number` instead.',
							fixWith: 'number'
						},
						Boolean: {
							message: 'Use `boolean` instead.',
							fixWith: 'boolean'
						},
						Symbol: {
							message: 'Use `symbol` instead.',
							fixWith: 'symbol'
						}
					}
				}],
				'@typescript-eslint/consistent-type-assertions': 'off',
				'@typescript-eslint/explicit-function-return-type': 'off',
				'@typescript-eslint/indent': ['error', 'tab', {
					MemberExpression: 0,
					SwitchCase: 1
				}],
				'@typescript-eslint/member-ordering': ['error', {
					default: [
						'signature',
						// Static
						'static-field', // = ['public-static-field', 'protected-static-field', 'private-static-field']
						'static-method', // = ['public-static-method', 'protected-static-method', 'private-static-method']
						// Fields
						'abstract-field', // = ['public-abstract-field', 'protected-abstract-field', 'private-abstract-field']
						'instance-field', // = ['public-instance-field', 'protected-instance-field', 'private-instance-field']
						// Constructor
						'constructor', // = ['public-constructor', 'protected-constructor', 'private-constructor']
						// Methods
						'abstract-method', // = ['public-abstract-method', 'protected-abstract-method', 'private-abstract-method']
						'instance-method' // = ['public-instance-method', 'protected-instance-method', 'private-instance-method']
					  ]
				}],
				'@typescript-eslint/method-signature-style': 'off',
				'@typescript-eslint/no-throw-literal': 'off',
				'@typescript-eslint/no-unnecessary-type-assertion': 'off',
				'@typescript-eslint/no-unused-vars': ['warn', {
					vars: 'all',
					varsIgnorePattern: '^_',
					args: 'after-used',
					ignoreRestSiblings: true,
					argsIgnorePattern: '^_',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_'
				}],
				'@typescript-eslint/prefer-nullish-coalescing': 'off',
				'@typescript-eslint/prefer-readonly-parameter-types': 'off',
				'@typescript-eslint/promise-function-async': 'off',
				'@typescript-eslint/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
				'@typescript-eslint/restrict-plus-operands': 'off',
				'@typescript-eslint/unified-signatures': 'off',
			}
		}
	],
	rules: {
		// Core
		'arrow-parens': 'off',
		'capitalized-comments': 'off',
		'func-names': 'off',
		'eqeqeq': ['error', 'always', {'null': 'ignore'}],
		'generator-star-spacing': ['error', { before: false, after: true }],
		'max-depth': ['error', 8],
		'no-await-in-loop': 'off',
		'no-else-return': 'off',
		'no-eq-null': 'off',
		'no-implicit-coercion': 'off',
		'no-multiple-empty-lines': ['error', { max: 2 }],
		'object-curly-spacing': ['error', 'always'],
		'operator-linebreak': ['error', 'after', { overrides: { '?': 'before', ':': 'before' } }],
		'quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
		'yield-star-spacing': ['error', 'after']
	}
};
