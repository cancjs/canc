import rollupCommonjs from '@rollup/plugin-commonjs';
// import rollupProgress from 'rollup-plugin-progress';
import rollupResolve from '@rollup/plugin-node-resolve';
import rollupTerser from '@rollup/plugin-terser';
import rollupTypescript from '@rollup/plugin-typescript';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import rollupFilesize from 'rollup-plugin-filesize';
import rollupExternals from 'rollup-plugin-node-externals';
import { fileURLToPath } from 'url';

const isVerbose = process.argv.slice(2).indexOf('--silent') === -1;

const trace = () => ({
  transform: (_content, id) => {
    if (isVerbose) {
      console.log(id);
    }
  },
});

// rootDir has to cover packages/_util and packages/_toolbox (relative-imported shared internal
// code, invariant 8 — inlined per package, not a real dependency) or TS throws TS6059. That
// widens declarationDir's mirrored output to dist/types/packages/<pkg>/src/* plus sibling
// dist/types/packages/_util(/_toolbox)/*.d.ts. Some src files (e.g. canc-promise's helpers.ts,
// canc-toolbox's index.ts) re-export shared-dir types, so those relative specifiers are load-
// bearing, not implementation detail — dropping the shared dirs here used to leave a dangling
// `../../_util` import in the published .d.ts (confirmed via attw: InternalResolutionError).
// Move the shared dirs to dist/types/<name> as siblings of the flattened src output instead of
// deleting them, then rewrite the surviving relative specifiers to match the new flat depth.
const sharedDirNames = ['_util', '_toolbox'];

const rewriteSharedDirImports = (typesDir) => {
  const specifierPattern = new RegExp(`(['"])((?:\\.\\./)+)(${sharedDirNames.join('|')})((?:/[^'"]*)?)\\1`, 'g');

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
        const original = fs.readFileSync(entryPath, 'utf8');
        const rewritten = original.replace(specifierPattern, (_match, quote, _dots, dirName, subpath) => {
          const target = path.join(typesDir, dirName);
          const relative = path.relative(path.dirname(entryPath), target).split(path.sep).join('/');

          return `${quote}${relative.startsWith('.') ? relative : `./${relative}`}${subpath}${quote}`;
        });

        if (rewritten !== original) {
          fs.writeFileSync(entryPath, rewritten);
        }
      }
    }
  };

  walk(typesDir);
};

const flattenDeclarations = () => ({
  name: 'flatten-declarations',
  writeBundle() {
    const pkgName = path.basename(process.cwd());
    const packagesDir = 'dist/types/packages';
    const nestedSrcDir = path.join(packagesDir, pkgName, 'src');

    if (!fs.existsSync(nestedSrcDir)) {
      return;
    }

    for (const entry of fs.readdirSync(nestedSrcDir)) {
      fs.renameSync(path.join(nestedSrcDir, entry), path.join('dist/types', entry));
    }
    fs.rmSync(path.join(packagesDir, pkgName), { recursive: true, force: true });

    if (fs.existsSync(packagesDir)) {
      // Only move the two shared dirs by name. Other siblings here are orphan mirrors of a
      // dependency package's own src (tsconfig `include` needs them in scope so `paths` aliases
      // type-check during declaration emit, e.g. canc-toolbox including "../canc-promise/src"),
      // never referenced by the emitted .d.ts (those import the real `@cancjs/*` package by bare
      // specifier) — drop them same as before, don't ship them in the tarball.
      for (const dirName of sharedDirNames) {
        const sharedDir = path.join(packagesDir, dirName);

        if (fs.existsSync(sharedDir)) {
          fs.renameSync(sharedDir, path.join('dist/types', dirName));
        }
      }
      fs.rmSync(packagesDir, { recursive: true, force: true });
      rewriteSharedDirImports('dist/types');
    }
  },
});

// TS floor = 4.2. downlevel-dts rewrites the handful of newer d.ts syntax
// forms it knows about (asserts predicates <3.7, template literal types <4.1,
// paired get/set <3.6...) into a dist/types-ts4.2/ variant. It does NOT know
// about `Awaited<T>` (lib-defined starting TS 4.5, per its own transform list —
// verified empty in node_modules/downlevel-dts/index.js) so a follow-up patch
// script injects a local shadow type alias into any file still referencing the
// bare name post-downlevel (scripts/patch-awaited.js — see comment there).
// CLI (not the internal `main` export) — that's undocumented API, stick to the
// public contract.
const TS_FLOOR = '4.2';
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const downlevelTypes = () => ({
  name: 'downlevel-types',
  writeBundle() {
    const typesDir = 'dist/types';

    if (!fs.existsSync(typesDir)) {
      return;
    }

    const variantDir = `dist/types-ts${TS_FLOOR}`;

    fs.rmSync(variantDir, { recursive: true, force: true });
    execFileSync(
      process.execPath,
      [path.join(repoRoot, 'node_modules/downlevel-dts/index.js'), typesDir, variantDir, `--to=${TS_FLOOR}`],
      { stdio: isVerbose ? 'inherit' : 'ignore' },
    );
    execFileSync(process.execPath, [path.join(repoRoot, 'scripts/patch-awaited.js'), variantDir], {
      stdio: isVerbose ? 'inherit' : 'ignore',
    });
  },
});

// Every package's runtime is dual CJS/ESM (dist/*.cjs + dist/*.mjs) but declaration emit only
// ever wrote plain .d.ts, one file serving both module systems via the same `exports["."].types`
// condition. TypeScript treats a .d.ts file's module kind as CJS unless the nearest package.json
// says "type": "module" — so the same file resolved from an ESM import site is misclassified
// (confirmed via attw: FalseCJS). Duplicate every emitted .d.ts to a sibling .d.mts (content is
// already plain `import`/`export` syntax, valid unchanged as ESM declarations) so the "import"
// exports condition can point at an unambiguous file while "require" keeps the original .d.ts.
// Under --moduleResolution node16/nodenext, ESM relative specifiers must carry an explicit
// extension (Node itself never guesses one for `import`, and never does directory/index
// fallback either). Our .d.ts source has neither (plain `from './cancel-error'` or `from
// './_util'` for a directory, emitted by tsc same as the .ts source wrote it) — fine for the
// CJS-resolved .d.ts twin, but breaks the ESM-resolved .d.mts twin (confirmed via attw: node16
// from-ESM InternalResolutionError). Rewrite bare relative specifiers in the .d.mts copy only:
// a specifier resolving to a file gets `.mjs` appended (TS's declaration extension substitution
// maps that back to the sibling `.d.mts`); a specifier resolving to a directory gets
// `/index.mjs` appended instead, since ESM has no directory-index shorthand at all.
const RELATIVE_SPECIFIER_PATTERN = /(\bfrom\s+|\bimport\()(['"])(\.\.?\/[^'"]+)\2/g;
const HAS_EXTENSION_PATTERN = /\.(m?[jt]sx?|cjs|json)$/;

const resolveMjsSpecifier = (specifier, fromDir) => {
  if (HAS_EXTENSION_PATTERN.test(specifier)) {
    return specifier;
  }

  const target = path.resolve(fromDir, specifier);

  return fs.existsSync(`${target}.d.ts`) ? `${specifier}.mjs` : `${specifier}/index.mjs`;
};

const duplicateAsMts = (dir) => ({
  name: 'duplicate-as-mts',
  writeBundle() {
    if (!fs.existsSync(dir)) {
      return;
    }

    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);

        if (entry.isDirectory()) {
          walk(entryPath);
        } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
          const content = fs.readFileSync(entryPath, 'utf8');
          const fromDir = path.dirname(entryPath);
          const rewritten = content.replace(
            RELATIVE_SPECIFIER_PATTERN,
            (_match, prefix, quote, specifier) => `${prefix}${quote}${resolveMjsSpecifier(specifier, fromDir)}${quote}`,
          );

          fs.writeFileSync(entryPath.replace(/\.d\.ts$/, '.d.mts'), rewritten);
        }
      }
    };

    walk(dir);
  },
});

// Declaration emit runs once (on the cjs build) and lands in dist/types;
// other outputs reuse the same tsconfig w/ declaration emit disabled so
// tsc doesn't run redundantly / race to write the same .d.ts files.
const createTypescriptPlugin = (emitDeclaration) =>
  rollupTypescript({
    tsconfig: './tsconfig.prod.json',
    outDir: 'dist',
    ...(emitDeclaration ?
      { declaration: true, declarationDir: 'dist/types' }
    : { declaration: false, declarationMap: false }),
    noEmitOnError: true,
  });

// An entry descriptor. `input` is the source module; `base` is the output basename under dist/
// (dist/<base>.cjs etc). Declaration emit runs only for the entry that requests it.
const defaultEntry = { input: 'src/index.ts', base: 'index' };

const createCommonConfig = (emitDeclaration, entry) => ({
  input: entry.input,
  plugins: [
    isVerbose && trace(),
    // isVerbose && rollupProgress(),
    rollupExternals(),
    rollupResolve(),
    createTypescriptPlugin(emitDeclaration),
    rollupCommonjs(),
  ],
});

const defaultExportInterop = (globalName) => ({
  name: 'default-export-interop',
  renderChunk(code, _chunk, outputOptions) {
    if (!code.includes('exports.default') && !code.includes('exports["default"]')) {
      return null;
    }

    const format = outputOptions.format;
    if (format === 'cjs') {
      const snippet = `
if (typeof exports !== 'undefined' && exports.default) {
  var _def = exports.default;
  if (typeof _def === 'function' || (typeof _def === 'object' && _def !== null)) {
    for (var key in exports) {
      if (Object.prototype.hasOwnProperty.call(exports, key)) {
        _def[key] = exports[key];
      }
    }
    _def.default = _def;
    _def.__esModule = true;
    module.exports = _def;
  }
}
`;
      return { code: code + snippet, map: null };
    }

    if (format === 'umd') {
      const gName = JSON.stringify(globalName);
      const snippet = `
if (typeof exports !== 'undefined' && exports.default) {
  var _def = exports.default;
  if (typeof _def === 'function' || (typeof _def === 'object' && _def !== null)) {
    for (var key in exports) {
      if (Object.prototype.hasOwnProperty.call(exports, key)) {
        _def[key] = exports[key];
      }
    }
    _def.default = _def;
    _def.__esModule = true;
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = _def;
    }
    if (typeof globalThis !== 'undefined' && globalThis[${gName}]) {
      globalThis[${gName}] = _def;
    } else if (typeof window !== 'undefined' && window[${gName}]) {
      window[${gName}] = _def;
    } else if (typeof self !== 'undefined' && self[${gName}]) {
      self[${gName}] = _def;
    }
  }
}
`;
      return { code: code + snippet, map: null };
    }

    return null;
  },
});

const createCjsConfig = (entry, emitDeclaration, options = {}) => {
  const config = createCommonConfig(emitDeclaration, entry);

  config.output = {
    file: `dist/${entry.base}.cjs`,
    format: 'cjs',
    exports: 'named',
    sourcemap: true,
  };
  // Declaration flatten/downlevel run once, on the declaration-emitting entry, to avoid two
  // tsc passes racing to write the same dist/types files.
  if (emitDeclaration) {
    config.plugins.push(
      flattenDeclarations(),
      downlevelTypes(),
      duplicateAsMts('dist/types'),
      duplicateAsMts(`dist/types-ts${TS_FLOOR}`),
    );
  }
  if (options.exportDefault || entry.exportDefault) {
    config.plugins.push(defaultExportInterop(options.name || entry.name));
  }
  config.plugins.push(isVerbose && rollupFilesize({ showMinifiedSize: false }));

  return config;
};

const createEsmConfig = (entry) => {
  const config = createCommonConfig(false, entry);

  config.output = {
    file: `dist/${entry.base}.mjs`,
    format: 'es',
    sourcemap: true,
  };
  config.plugins.push(isVerbose && rollupFilesize({ showMinifiedSize: false }));

  return config;
};

const createUmdConfig = (entry, options = {}) => {
  const config = createCommonConfig(false, entry);

  config.output = {
    file: `dist/${entry.base}.umd.js`,
    format: 'umd',
    name: options.name,
    exports: 'named',
    sourcemap: true,
  };
  if (options.exportDefault || entry.exportDefault) {
    config.plugins.push(defaultExportInterop(options.name || entry.name));
  }
  config.plugins.push(isVerbose && rollupFilesize({ showMinifiedSize: false }));

  return config;
};

const createUmdMinConfig = (entry, options = {}) => {
  const config = createCommonConfig(false, entry);

  config.output = {
    file: `dist/${entry.base}.umd.min.js`,
    format: 'umd',
    name: options.name,
    exports: 'named',
    sourcemap: true,
  };
  if (options.exportDefault || entry.exportDefault) {
    config.plugins.push(defaultExportInterop(options.name || entry.name));
  }
  config.plugins.push(
    rollupTerser({
      output: {
        comments: (_node, comment) => {
          const text = comment.value;
          const isMultiline = comment.type === 'comment2';

          return isMultiline && /@preserve/i.test(text);
        },
      },
    }),
    isVerbose && rollupFilesize({ showMinifiedSize: false }),
  );

  return config;
};

// Build all four output formats for one entry. The primary entry (declaration emit on) drives the
// .d.ts pass; additional twin entries reuse the same tsconfig with declaration emit disabled.
const createEntryConfigs = (entry, options, emitDeclaration) => {
  const mergedOptions = { ...options, ...entry, name: entry.name || (options && options.name) };
  return [
    createCjsConfig(entry, emitDeclaration, mergedOptions),
    createEsmConfig(entry),
    createUmdConfig(entry, mergedOptions),
    createUmdMinConfig(entry, mergedOptions),
  ];
};

export const createConfigs = (options = { name: 'LibraryName' }) => createEntryConfigs(defaultEntry, options, true);

// Multi-entry variant for packages that ship twin entry points (e.g. a `-native` flavor). The
// first entry emits declarations; the rest reuse the same type output. Each entry needs a distinct
// `base` and may set its own UMD global `name`.
export const createMultiConfigs = (entries, options = { name: 'LibraryName' }) =>
  entries.flatMap((entry, index) =>
    createEntryConfigs(entry, { ...options, ...entry, name: entry.name || options.name }, index === 0),
  );

export default null;
