// @ts-check
// Flat config for the examples project. examples/ is a separate npm project, so the root config
// ignores it and this file owns it. It is deliberately a subset of the root config.
//
// Two things shape it.
//
// No type-aware rules. tsconfig.examples.json excludes eight app directories and every spec, so
// typed linting would fail with "file not included in project" across a large part of the tree.
// Types here are already checked by examples:typecheck and proven by examples:test.
//
// Everything that survives is either autofixable (prettier, import sorting, prefer-const) or a
// plain mistake (unused binding, ==). Example code is read as documentation, so it must never
// need an inline eslint-disable to stay clean. If a rule ever needs silencing here, silence it in
// this file for the whole directory instead.

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const prettierCodeOptions = {
  endOfLine: 'auto',
  singleQuote: true,
  printWidth: 120,
  singleAttributePerLine: true,
  experimentalTernaries: true,
  useTabs: false,
  tabWidth: 2,
};

export default defineConfig(
  globalIgnores([
    '**/~~*',
    '**/*~~',
    '**/*~~*',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/package-lock.json',
    // Vue single file components need the vue parser, which this project does not install.
    '**/*.vue',
  ]),

  {
    files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'warn',

      // Example code shows shapes the reader already has in front of them. Naming every parameter
      // type and writing out every any is noise here, not safety.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',

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
    },
  },

  // require() is deliberate throughout the examples: the .js and .cjs ones exist to show the
  // library working from a commonjs entry point, and several apps pick a driver at runtime
  // (postgres vs pglite) or load an optional dependency lazily so the mock path runs without it.
  {
    files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Framework store idiom: a generator body has its own `this`, so the store has to be captured
  // in a local first.
  {
    files: ['**/stores/**/*.ts'],
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
    },
  },

  // Ambient module declarations are copied from the framework's own docs (the Vue SFC shim), so
  // they carry that boilerplate's `{}` types.
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  {
    files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },

  {
    files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
    extends: [prettierConfig],
    plugins: { prettier },
    rules: {
      'prettier/prettier': ['error', prettierCodeOptions],
    },
  },
);
