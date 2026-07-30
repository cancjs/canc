// @ts-check
// Flat config (ESLint 10). Base is typescript-eslint's recommended-type-checked + stylistic
// presets with this project's own overrides on top, replacing the former xo / xo-typescript
// setup. Formatting is prettier, run as an ESLint rule so there is a single lint entry point and
// a single --fix pass. No react/jsx.
//
// Kept structurally parallel to the eslint-plugin-canc config (same block order, same comment
// headings) so the two can be diffed. Differences between them are scope differences, not style
// drift: that project has no browser globals, uses projectService instead of per-package
// projects, and lints its own rule sources with eslint-plugin-eslint-plugin.

import js from '@eslint/js';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import { defineConfig, globalIgnores } from 'eslint/config';
import packageJson from 'eslint-package-json';
import prettierConfig from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Prettier options for code. Tabs match the existing sources. Shared verbatim with the
// eslint-plugin-canc config; change them in both or in neither.
const prettierCodeOptions = {
	endOfLine: 'auto',
	singleQuote: true,
	printWidth: 120,
	singleAttributePerLine: true,
	experimentalTernaries: true,
	useTabs: true,
};

// JSON keeps spaces. npm rewrites package.json when it touches it and preserves whatever indent
// it finds, so tabs there would only invite churn.
//
// trailingComma must be none: prettier's jsonc parser would otherwise emit trailing commas that
// the json/jsonc language then refuses to parse, so the two would fight over every fixed file.
const prettierJsonOptions = {
	endOfLine: 'auto',
	useTabs: false,
	tabWidth: 2,
	trailingComma: 'none',
};

export default defineConfig(
	// Scratch convention (`~~` prefix/suffix, files + dirs) plus build output and lockfiles.
	// examples/ is a separate npm project with its own toolchain.
	globalIgnores([
		'**/~~*',
		'**/*~~',
		'**/*~~*',
		'**/build/**',
		'**/dist/**',
		'**/coverage/**',
		'**/node_modules/**',
		'**/package-lock.json',
		'examples/**',
		// Type-matrix fixtures, compiled by the matrix runner against a range of TypeScript
		// versions. Linting them with this repo's single TS config would be meaningless.
		'tests-types/fixtures/**',
	]),

	// Presets must stay scoped to JS/TS. Unscoped they also apply to the JSON and markdown blocks
	// below, and core rules crash on those languages' ASTs.
	{
		files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
		extends: [
			js.configs.recommended,
			tseslint.configs.recommendedTypeChecked,
			tseslint.configs.stylisticTypeChecked,
		],
	},

	// Shared language options + core rule overrides (every JS/TS file).
	{
		files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.browser,
			},
		},
		rules: {
			eqeqeq: ['error', 'always', { null: 'ignore' }],
			'max-depth': ['error', 8],
			'prefer-const': 'warn',
		},
	},

	// TypeScript sources. The project here is the root-level lint project, which is what makes
	// `eslint .` work from the repo root: it covers the shared inlinable dirs and the tooling
	// scripts, which belong to no package tsconfig. Each package config overrides this with its
	// own project so a per-package run stays scoped to that package.
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				project: ['./tsconfig.eslint.json'],
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/array-type': 'off',
			'@typescript-eslint/consistent-generic-constructors': 'warn',
			'@typescript-eslint/consistent-type-assertions': 'off',
			'@typescript-eslint/dot-notation': 'warn',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/method-signature-style': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-unnecessary-type-assertion': 'off',
			'@typescript-eslint/only-throw-error': 'off',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
			'@typescript-eslint/prefer-readonly-parameter-types': 'off',
			'@typescript-eslint/promise-function-async': 'off',
			'@typescript-eslint/restrict-plus-operands': 'off',
			'@typescript-eslint/unified-signatures': 'off',

			// Wrapper object types are never what the author meant.
			'@typescript-eslint/no-restricted-types': [
				'error',
				{
					types: {
						String: { message: 'Use `string` instead.', fixWith: 'string' },
						Number: { message: 'Use `number` instead.', fixWith: 'number' },
						Boolean: { message: 'Use `boolean` instead.', fixWith: 'boolean' },
						Symbol: { message: 'Use `symbol` instead.', fixWith: 'symbol' },
					},
				},
			],

			'@typescript-eslint/member-ordering': [
				'error',
				{
					default: [
						'signature',
						'static-field',
						'static-method',
						'abstract-field',
						'instance-field',
						'constructor',
						'abstract-method',
						'instance-method',
					],
				},
			],

			'@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: true }],

			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					vars: 'all',
					varsIgnorePattern: '^_',
					args: 'after-used',
					argsIgnorePattern: '^_',
					ignoreRestSiblings: true,
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_',
				},
			],

			// Pre-existing type debt. These stay at warn so they are visible without blocking a
			// build, and get cleared package by package.
			'@typescript-eslint/no-duplicate-type-constituents': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-misused-promises': 'warn',
			'@typescript-eslint/no-require-imports': 'warn',
			'@typescript-eslint/no-this-alias': 'warn',
			'@typescript-eslint/no-unnecessary-type-constraint': 'warn',
			'@typescript-eslint/no-unsafe-argument': 'warn',
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-unsafe-function-type': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-unsafe-return': 'warn',
			'@typescript-eslint/prefer-function-type': 'warn',
			'@typescript-eslint/unbound-method': 'warn',
		},
	},

	// Specs. Tests deliberately do things production code should not: create a promise purely to
	// assert on it later, hold a reference that is never read again, reject with a non-Error to
	// prove the library tolerates it. Scoping these here keeps them enforced everywhere else.
	{
		files: ['**/*.spec.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
		rules: {
			'no-useless-assignment': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/prefer-promise-reject-errors': 'off',
			'@typescript-eslint/require-await': 'off',
			'@typescript-eslint/unbound-method': 'off',
		},
	},

	// JavaScript sources (jest, rollup and eslint configs, scripts). Not in any tsconfig project,
	// so type-aware rules cannot run on them.
	{
		files: ['**/*.{js,jsx,cjs,mjs}'],
		extends: [tseslint.configs.disableTypeChecked],
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'warn',
		},
	},

	// Import hygiene. Sources already follow this grouping; the rules just keep it that way.
	{
		files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
		plugins: {
			'simple-import-sort': simpleImportSort,
			'import-x': importX,
		},
		rules: {
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error',
			'import-x/first': 'error',
			'import-x/newline-after-import': 'error',
			'import-x/no-duplicates': 'error',
		},
	},

	// JSON. @eslint/json parses through the language API, which exposes real source text, so
	// prettier/prettier runs here too and one --fix pass covers both correctness and layout.
	{
		files: ['**/*.json'],
		ignores: ['**/tsconfig*.json'],
		language: 'json/json',
		extends: [json.configs.recommended],
		plugins: { prettier },
		rules: {
			'prettier/prettier': ['error', { ...prettierJsonOptions, parser: 'json' }],
		},
	},

	// tsconfig files carry comments, so they are JSONC whatever the extension says.
	{
		files: ['**/tsconfig*.json', '**/*.jsonc', '.vscode/*.json'],
		language: 'json/jsonc',
		// TypeScript accepts trailing commas in tsconfig, and some of these files use them, so the
		// language has to parse them. Prettier then normalises them away.
		languageOptions: { allowTrailingCommas: true },
		extends: [json.configs.recommended],
		plugins: { prettier },
		rules: {
			'prettier/prettier': ['error', { ...prettierJsonOptions, parser: 'jsonc' }],
		},
	},

	// package.json manifests. Must come after the generic JSON block so these rules win.
	{
		files: ['**/package.json'],
		language: 'json/json',
		extends: [packageJson.configs.recommended],
		plugins: { prettier },
		rules: {
			// Packages are commonjs on purpose: the build emits ES5-capable CJS alongside ESM.
			'package-json/prefer-type-module': 'off',
			// No CI yet, so nothing can produce provenance attestations.
			'package-json/prefer-provenance': 'off',
			// False positive on a workspace layout: it reads packages/*/package.json as nested
			// manifests, but those are package roots and their exports field is honoured.
			'package-json/no-nested-exports': 'off',
			// main/module/unpkg/jsdelivr are kept alongside exports on purpose, for old bundlers
			// and for the CDN entries. Dropping them would break the published surface.
			'package-json/prefer-exports': 'off',
			// Same reason: those legacy fields conventionally carry no ./ prefix.
			'package-json/consistent-path-prefix': 'off',
			// The rule infers ESM and flags the .d.ts as mismatched. These packages are commonjs
			// with downlevelled types, which is the intended pairing.
			'package-json/require-types-in-exports': 'off',
			// The condition lists are exhaustive (types/import/require), so a default fallback
			// would only mask a genuinely missing condition.
			'package-json/require-default-condition': 'off',
			// engines.npm is deliberate. This repo pins no packageManager field.
			'package-json/no-package-manager-engines': 'off',
			// A `*` range marks a workspace-linked sibling, resolved by npm workspaces.
			'package-json/no-wildcard-dependencies': 'off',
			// devDependencies are pinned with ~ by convention across this repo.
			'package-json/dependency-version-range': 'off',

			// Real gaps in the manifests, not disagreements with the rules. They need content
			// decisions (what a package is called in one line, which keywords it claims), so they
			// stay visible as warnings and get cleared per package rather than blocking a lint run.
			'package-json/no-empty-fields': 'warn',
			'package-json/require-engines': 'warn',
			'package-json/require-bin-shebang': 'warn',
			'package-json/prefer-shorthand': 'warn',
			'package-json/no-dist-tag-dependencies': 'warn',
			'package-json/peer-dependencies-as-dev-dependencies': 'warn',

			'prettier/prettier': ['error', { ...prettierJsonOptions, parser: 'json' }],
		},
	},

	// Type-matrix fixture manifests. Scaffolding for the TypeScript version matrix, never
	// published and never installed as a package, so the publishing rules do not apply. The
	// `latest` dist-tag is the point of the latest lane.
	{
		files: ['tests-types/fixtures/**/package.json'],
		rules: {
			'package-json/no-dist-tag-dependencies': 'off',
			'package-json/require-engines': 'off',
			'package-json/require-fields': 'off',
			'package-json/prefer-files-field': 'off',
			'package-json/require-entry-point': 'off',
			'package-json/no-empty-fields': 'off',
		},
	},

	// Markdown. proseWrap stays at its default (preserve), so prose is never rewrapped; this only
	// normalizes list markers, headings, fences and tables.
	{
		files: ['**/*.md'],
		language: 'markdown/gfm',
		plugins: { markdown, prettier },
		rules: {
			'prettier/prettier': ['error', { endOfLine: 'auto', singleQuote: true, parser: 'markdown' }],
		},
	},

	// Code formatting. eslint-config-prettier first switches off every layout rule the presets
	// enable, then prettier owns layout outright.
	{
		files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
		extends: [prettierConfig],
		plugins: { prettier },
		rules: {
			'prettier/prettier': ['error', prettierCodeOptions],
		},
	},
);
