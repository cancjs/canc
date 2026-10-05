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
  //
  // A `node:` target is the one exception, and it is the rule's own reasoning rather than an escape
  // from it. Mirroring the remainder of a builtin is the point of those modules: the names come from
  // the runtime, so enumerating them here would pin the published surface to whichever Node built
  // the tarball. What the package actually promises is pinned by the surface manifests and the
  // baseline, which is where a change to it has to be declared.
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportAllDeclaration[source.value=/^(?!node:)/]',
          message: 'Re-export by name (export { a, b } from "./x"), not export *.',
        },
      ],
    },
  },
);
