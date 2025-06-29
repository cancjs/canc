// @ts-check
// Flat config (ESLint 9). Migrated from the former xo / xo-typescript .eslintrc.js.
// The latest eslint-config-xo(-typescript) require ESLint >=10, prettier and
// TypeScript >=6, so instead of their flat exports the base here is
// typescript-eslint's recommended-type-checked + stylistic presets, with the
// project's own xo-derived overrides ported on top. NO prettier, NO react/jsx.

import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		// Scratch convention (`~~` prefix/suffix, files + dirs) plus build output
		// and lockfiles. Mirrors the former .eslintignore.
		ignores: [
			'**/~~*',
			'**/*~~',
			'**/*~~*',
			'**/build/**',
			'**/dist/**',
			'**/coverage/**',
			'**/node_modules/**',
			'package-lock.json',
			'yarn.lock',
		],
	},

	// Base presets. recommended-type-checked + stylistic-type-checked replace the
	// old `xo` / `xo-typescript` extends; @stylistic supplies the layout rules the
	// old config tuned by hand (indent, quotes, operator-linebreak, ...).
	js.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylisticTypeChecked,

	// Shared language options + core rule overrides (applies to every file).
	{
		plugins: {
			'@stylistic': stylistic,
		},
		languageOptions: {
			globals: {
				...globals.node,
				...globals.browser,
			},
		},
		rules: {
			// Core
			'arrow-parens': 'off',
			'capitalized-comments': 'off',
			'func-names': 'off',
			'eqeqeq': ['error', 'always', { null: 'ignore' }],
			'max-depth': ['error', 8],
			'no-await-in-loop': 'off',
			'no-else-return': 'off',
			'no-eq-null': 'off',
			'no-implicit-coercion': 'off',
			'prefer-const': 'warn',

			// @stylistic (layout rules extracted from ESLint core / typescript-eslint)
			// Indentation (indent) and basic formatting are warn level — source uses mixed tabs/spaces,
			// and formatting rules are deferred to cleanup phases.
			'@stylistic/generator-star-spacing': ['warn', { before: false, after: true }],
			'@stylistic/indent': ['warn', 'tab', {
				MemberExpression: 0,
				SwitchCase: 1,
			}],
			'@stylistic/no-multiple-empty-lines': ['warn', { max: 2 }],
			'@stylistic/object-curly-spacing': ['warn', 'always'],
			'@stylistic/operator-linebreak': ['warn', 'after', { overrides: { '?': 'before', ':': 'before' } }],
			'@stylistic/quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
			'@stylistic/yield-star-spacing': ['warn', 'after'],
		},
	},

	// TypeScript sources.
	{
		files: ['**/*.ts', '**/*.tsx'],
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

			// @typescript-eslint
			'@typescript-eslint/array-type': 'off',
			// ban-types was removed in typescript-eslint v8; the wrapper-object bans
			// below are ported to its successor, no-restricted-types.
			'@typescript-eslint/no-restricted-types': ['error', {
				types: {
					String: {
						message: 'Use `string` instead.',
						fixWith: 'string',
					},
					Number: {
						message: 'Use `number` instead.',
						fixWith: 'number',
					},
					Boolean: {
						message: 'Use `boolean` instead.',
						fixWith: 'boolean',
					},
					Symbol: {
						message: 'Use `symbol` instead.',
						fixWith: 'symbol',
					},
				},
			}],
			'@typescript-eslint/consistent-generic-constructors': 'warn',
			'@typescript-eslint/consistent-type-assertions': 'off',
			'@typescript-eslint/dot-notation': 'warn',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-empty-function': 'off',
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
					'instance-method', // = ['public-instance-method', 'protected-instance-method', 'private-instance-method']
				],
			}],
			'@typescript-eslint/method-signature-style': 'off',
			// no-throw-literal (extension rule) became only-throw-error in v8.
			'@typescript-eslint/only-throw-error': 'off',
			'@typescript-eslint/no-unnecessary-type-assertion': 'off',
			// Type-aware correctness rules downgraded to warn (v8 recommended is strict, but
			// codebase has pre-existing type debt; these fire as warnings until cleanup phases).
			// no-explicit-any: warn (replaces v8 strict error; old xo-typescript had it off)
			// no-unsafe-*: warn (same rationale; deferred cleanup)
			// no-unnecessary-type-constraint: warn (pre-existing, was error in old xo too)
			// no-duplicate-type-constituents: warn (new in v8)
			// no-unsafe-function-type: warn (new in v8)
			// no-prefer-function-type: warn (linting aid)
			// unbound-method: warn
			// no-this-alias: warn (minor correctness)
			// no-misused-promises: warn
			'@typescript-eslint/no-duplicate-type-constituents': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: true }],
			'@typescript-eslint/no-misused-promises': 'warn',
			'@typescript-eslint/no-this-alias': 'warn',
			'@typescript-eslint/no-unsafe-argument': 'warn',
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-unsafe-function-type': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-unsafe-return': 'warn',
			'@typescript-eslint/no-unnecessary-type-constraint': 'warn',
			'@typescript-eslint/no-unused-vars': ['warn', {
				vars: 'all',
				varsIgnorePattern: '^_',
				args: 'after-used',
				ignoreRestSiblings: true,
				argsIgnorePattern: '^_',
				caughtErrors: 'all',
				caughtErrorsIgnorePattern: '^_',
			}],
			'@typescript-eslint/no-require-imports': 'warn',
			'@typescript-eslint/prefer-function-type': 'warn',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
			'@typescript-eslint/prefer-readonly-parameter-types': 'off',
			'@typescript-eslint/promise-function-async': 'off',
			'@typescript-eslint/unbound-method': 'warn',
			// quotes moved to @stylistic in typescript-eslint v8.
			'@stylistic/quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
			'@typescript-eslint/restrict-plus-operands': 'off',
			'@typescript-eslint/unified-signatures': 'off',
		},
	},

	// JavaScript sources (config/tooling scripts): jest, rollup, eslint configs.
	// Type-checked rules can't run on these (not in any tsconfig project), so
	// disable them, then apply the JS-specific overrides from the old config.
	{
		files: ['**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
		extends: [tseslint.configs.disableTypeChecked],
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'warn',
			'prefer-object-spread': 'off',
		},
	},
);
