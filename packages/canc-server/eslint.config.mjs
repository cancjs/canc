// @ts-check
import * as path from 'node:path';
import * as url from 'node:url';

import tseslint from 'typescript-eslint';

import rootConfig from '../../eslint.config.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export default tseslint.config(
  ...rootConfig,

  // Typed linting for the files in this directory, which belong to no member below it and so to
  // no member tsconfig. Same shape as each member's config; tsconfigRootDir is not merged from the
  // root config and has to be set here.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
  },
);
