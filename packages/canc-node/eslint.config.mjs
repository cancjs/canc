// @ts-check
import * as path from 'node:path';
import * as url from 'node:url';

import tseslint from 'typescript-eslint';

import rootConfig from '../../eslint.config.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export default tseslint.config(
  ...rootConfig,

  // Typed linting: point at this package's tsconfig (the universal one used by
  // IDE TS & ESLint, covering src + specs). tsconfigRootDir must be set per
  // package as it is not merged from the root config.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
  },

  // The published barrels re-export by name, never by `export *`: a star export hands the
  // public surface to whoever last added an `export` keyword inside the target module, which is
  // the opposite of a deliberate published list.
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportAllDeclaration',
          message: 'Re-export by name (export { a, b } from "./x"), not export *.',
        },
      ],
    },
  },
);
