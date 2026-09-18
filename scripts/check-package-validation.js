// Packaging gate: asserts every path a package's manifest promises (main, module, types,
// unpkg, jsdelivr, and every condition inside "exports", including nested import/require and
// versioned "types@<range>" conditions) actually lands in the tarball `npm pack` would publish.
// Runs against the PACKED file list (via `npm pack --json --dry-run`), not the source tree, so it
// catches a path that only exists in dist/ locally but got excluded by "files" or never built.
//
// High-value here specifically because the published surface is dual CJS/ESM + UMD + the
// `types@<4.7` condition + downlevel-dts output: any of those four being wrong silently ships a
// package that resolves for some consumers and not others.
//
// Assumes `npm run build` already ran (dist/ populated) for every package under packages/*.
//
// Usage: node scripts/check-package-validation.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

// Export surfaces of published releases, read from their tarballs and not from this working tree
// (the file's own note records how to add one)
const PEER_FLOOR_SURFACES = require('./peer-floor-surface.json').surfaces;

function listPackages() {
  const names = [];
  for (const name of fs.readdirSync(PACKAGES_DIR)) {
    const dir = path.join(PACKAGES_DIR, name);
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      names.push(name);
      continue;
    }
    // Family container with no manifest of its own (e.g. packages/canc-server): descend one
    // level and take children that have a manifest.
    // No further descent, matches repo layout.
    for (const childName of fs.readdirSync(dir)) {
      if (fs.existsSync(path.join(dir, childName, 'package.json'))) {
        names.push(path.join(name, childName));
      }
    }
  }
  return names.sort();
}

// npm 11 prints a top-level array; npm 12 keys the same payload by package name instead,
// breaking the old array destructure; a single-package dry-run has one entry either way
function firstPackResult(rawJson) {
  const parsed = JSON.parse(rawJson);
  return Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
}

function packFileList(pkgDir) {
  const out = execSync('npm pack --json --dry-run', {
    cwd: pkgDir,
    encoding: 'utf8',
  });
  const result = firstPackResult(out);
  return new Set(result.files.map((f) => f.path.split(path.sep).join('/')));
}

// Every string value reachable inside package.json "exports", flattened, regardless of nesting
// depth (".", "./sub", condition objects, nested import/require branches, versioned "types@..").
function collectExportsPaths(exportsField) {
  const found = [];
  const walk = (node) => {
    if (typeof node === 'string') {
      found.push(node);
    } else if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(exportsField);
  return found;
}

function normalize(p) {
  return p.startsWith('./') ? p.slice(2) : p;
}

// The interop shim copies every barrel export onto the default export object,
// so in a package that has a default export, a barrel name matching one of that
// object's own properties overwrites the property in CJS and UMD builds
// ESM keeps both separate; nothing collides today, so this guards against a
// future export silently deleting a static in CJS and UMD targets
async function collectDefaultExportShadowing(pkgDir, manifest) {
  const entry = typeof manifest.module === 'string' ? manifest.module : null;
  if (!entry) return [];

  const entryFile = path.join(pkgDir, normalize(entry));
  if (!fs.existsSync(entryFile)) return [];

  let namespace;
  try {
    namespace = await import(pathToFileURL(entryFile).href);
  } catch (err) {
    return [`ESM entry ${entry} failed to import: ${err.message}`];
  }

  const defaultExport = namespace.default;
  const isNamespaceObject =
    defaultExport !== null && (typeof defaultExport === 'object' || typeof defaultExport === 'function');
  if (!isNamespaceObject) return [];

  const defaultMembers = new Set(Object.getOwnPropertyNames(defaultExport));
  const shadowed = Object.keys(namespace).filter((name) => defaultMembers.has(name));

  if (shadowed.length === 0) return [];

  return [`barrel exports shadow members of the default export in CJS and UMD builds: ${shadowed.sort().join(', ')}`];
}

// UMD is a browser-consumer concern; read it off the package's own rollup config instead of the
// unpkg/jsdelivr manifest keys, so dropping those keys by accident does not silently disable the
// check they exist to corroborate.
// Server packages pass formats: ['cjs', 'esm'] and never emit a umd output entry; everyone else
// takes the base config's default four formats.
async function packageExpectsUmd(pkgDir) {
  const configPath = path.join(pkgDir, 'rollup.config.mjs');
  if (!fs.existsSync(configPath)) return false;

  // plugin-typescript resolves its tsconfig option against process.cwd(), not the config
  // file's own directory, so importing it for inspection needs a real chdir into the package.
  const previousCwd = process.cwd();
  process.chdir(pkgDir);
  let rollupConfig;
  try {
    rollupConfig = (await import(pathToFileURL(configPath).href)).default;
  } finally {
    process.chdir(previousCwd);
  }

  const configs = Array.isArray(rollupConfig) ? rollupConfig : [rollupConfig];

  return configs.some((config) => config && config.output && config.output.format === 'umd');
}

// Peers stay external to every bundle, so the built output keeps the import specifiers verbatim
// Built ESM plus emitted declarations covers value and type imports, the whole resolvable set
// Never the package's own barrel: that lists what it exports, not what it needs from elsewhere
const NAMED_IMPORT = /(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"](@cancjs\/[^'"]+)['"]/g;
const QUALIFIED_IMPORT = /import\(\s*['"](@cancjs\/[^'"]+)['"]\s*\)\s*\.\s*([A-Za-z_$][\w$]*)/g;

function listFilesRecursive(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFilesRecursive(full, acc);
    else acc.push(full);
  }
  return acc;
}

function collectPeerImports(pkgDir) {
  const byPeer = new Map();
  const add = (peer, name) => {
    if (name === 'default') return;
    if (!byPeer.has(peer)) byPeer.set(peer, new Set());
    byPeer.get(peer).add(name);
  };

  for (const file of listFilesRecursive(path.join(pkgDir, 'dist'))) {
    if (!/\.(mjs|d\.ts|d\.mts|d\.cts)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');

    let match;
    NAMED_IMPORT.lastIndex = 0;
    while ((match = NAMED_IMPORT.exec(text)) !== null) {
      for (const clause of match[1].split(',')) {
        const trimmed = clause.trim().replace(/^type\s+/, '');
        if (!trimmed) continue;
        add(match[2], trimmed.split(/\s+as\s+/)[0].trim());
      }
    }
    QUALIFIED_IMPORT.lastIndex = 0;
    while ((match = QUALIFIED_IMPORT.exec(text)) !== null) {
      add(match[1], match[2]);
    }
  }

  return byPeer;
}

/** Every non-relative module specifier an emitted declaration references. */
function collectBareSpecifiers(content) {
  const found = new Set();
  const patterns = [
    /(?:import|export)(?:[\s\S]+?from)?\s*['"]([^.'"][^'"]*)['"]/g,
    /import\(\s*['"]([^.'"][^'"]*)['"]\s*\)/g,
    /require\(\s*['"]([^.'"][^'"]*)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      found.add(match[1]);
    }
  }

  return found;
}

/**
 * Whether a consumer installing only this package's manifest could resolve the specifier. Node
 * builtins always resolve; anything else has to be declared, because a transitive dependency is not
 * a promise the manifest makes.
 */
function isResolvableBareSpecifier(specifier, manifest) {
  if (specifier.startsWith('node:')) return true;

  // `@scope/name/deep/path` and `name/deep/path` both resolve through the package name alone.
  const segments = specifier.split('/');
  const pkgName = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];

  if (require('module').builtinModules.includes(pkgName)) return true;

  const declared = [manifest.dependencies, manifest.peerDependencies, manifest.optionalDependencies].filter(Boolean);

  if (declared.some((set) => Object.prototype.hasOwnProperty.call(set, pkgName))) return true;

  return declaredTypeSatellites(declared).has(pkgName);
}

/**
 * Type-only packages a consumer necessarily has because a declared dependency's DefinitelyTyped
 * package requires them. An untyped dependency like express forces the consumer to install
 * `@types/express`, which in turn depends on `@types/express-serve-static-core`, so a declaration
 * referencing `express-serve-static-core` does resolve on their machine even though this package
 * never names it.
 *
 * Deliberately one level deep and driven by the installed manifests rather than a hand-kept list of
 * names, so a satellite that stops being required stops being accepted.
 */
function declaredTypeSatellites(declared) {
  const allowed = new Set();

  for (const set of declared) {
    for (const dep of Object.keys(set)) {
      if (dep.startsWith('@types/')) continue;

      const typesPkg = `@types/${dep.replace('@', '').replace('/', '__')}`;

      try {
        const typesManifest = require(require.resolve(`${typesPkg}/package.json`, { paths: [ROOT] }));

        for (const name of Object.keys(typesManifest.dependencies || {})) {
          if (name.startsWith('@types/')) {
            allowed.add(name.slice('@types/'.length).replace('__', '/'));
          }
        }
      } catch {
        // No DefinitelyTyped package for this dependency, so it contributes no satellites.
      }
    }
  }

  return allowed;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function isAtLeast(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

function workspacePackages() {
  const found = new Map();
  for (const name of listPackages()) {
    const dir = path.join(PACKAGES_DIR, name);
    found.set(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name, dir);
  }
  return found;
}

// A floor that is not published yet has no tarball to read, so the release it names is the one
// being prepared in this tree and the locally built declarations are its surface.
function localSurface(pkgDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const entry = path.join(pkgDir, normalize(manifest.types || ''));
  if (!manifest.types || !fs.existsSync(entry)) return null;

  const ts = require('typescript');
  const program = ts.createProgram([entry], { skipLibCheck: true, target: ts.ScriptTarget.ES2018 });
  const source = program.getSourceFile(entry);
  const checker = program.getTypeChecker();
  const symbol = source && checker.getSymbolAtLocation(source);
  if (!symbol) return null;

  return new Set(checker.getExportsOfModule(symbol).map((s) => s.getName()));
}

// A package may only import names the release at its own declared peer floor actually ships
// Otherwise the install resolves quietly against that floor and the call fails at runtime
function collectPeerFloorViolations(pkgDir, manifest, workspace) {
  const ranges = { ...(manifest.peerDependencies || {}), ...(manifest.dependencies || {}) };
  const imports = collectPeerImports(pkgDir);
  const problems = [];

  for (const [peer, names] of imports) {
    const range = ranges[peer];
    if (!range) {
      problems.push(`imports from ${peer} but neither depends on it nor declares it as a peer`);
      continue;
    }

    const declared = /^>=\s*(\S+)$/.exec(range);
    if (!declared) {
      problems.push(`peer range for ${peer} is "${range}", expected a floor of the form ">=x.y.z"`);
      continue;
    }

    const floor = declared[1];
    const parsedFloor = parseVersion(floor);
    let surface = null;

    const published = PEER_FLOOR_SURFACES[peer] && PEER_FLOOR_SURFACES[peer][floor];
    if (published) {
      surface = new Set(published);
    } else {
      const peerDir = workspace.get(peer);
      const localVersion =
        peerDir && parseVersion(JSON.parse(fs.readFileSync(path.join(peerDir, 'package.json'), 'utf8')).version);
      if (peerDir && parsedFloor && localVersion && isAtLeast(parsedFloor, localVersion)) {
        surface = localSurface(peerDir);
      }
    }

    if (!surface) {
      problems.push(`no recorded export surface for ${peer}@${floor}, so the declared peer floor cannot be checked`);
      continue;
    }

    const absent = [...names].filter((name) => !surface.has(name)).sort();
    if (absent.length > 0) {
      problems.push(`imports names absent from ${peer}@${floor} (the declared peer floor): ${absent.join(', ')}`);
    }
  }

  return problems;
}

async function checkPackage(pkgName, workspace) {
  const pkgDir = path.join(PACKAGES_DIR, pkgName);
  const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const packedFiles = packFileList(pkgDir);

  const referenced = new Set();
  for (const field of ['main', 'module', 'types', 'unpkg', 'jsdelivr']) {
    if (typeof manifest[field] === 'string') referenced.add(normalize(manifest[field]));
  }
  if (manifest.exports) {
    for (const p of collectExportsPaths(manifest.exports)) referenced.add(normalize(p));
  }

  const missing = [...referenced].filter((p) => !packedFiles.has(p));

  const hasCjs = [...packedFiles].some((f) => f.endsWith('.cjs'));
  const hasMjs = [...packedFiles].some((f) => f.endsWith('.mjs') && !f.endsWith('.d.mts'));
  const hasUmd = [...packedFiles].some((f) => /\.umd\.js$/.test(f));
  const hasUmdMin = [...packedFiles].some((f) => /\.umd\.min\.js$/.test(f));
  const expectsUmd = await packageExpectsUmd(pkgDir);

  const exportsText = JSON.stringify(manifest.exports || {});
  const declaresLegacyTypesCondition = /types@</.test(exportsText);
  const hasDownlevelDts = [...packedFiles].some((f) => f.startsWith('dist/types-ts'));

  const hasAnyCancDep =
    Object.keys(manifest.dependencies || {}).some((k) => k.startsWith('@cancjs/')) ||
    Object.keys(manifest.peerDependencies || {}).some((k) => k.startsWith('@cancjs/'));

  const problems = [];
  if (missing.length > 0) {
    problems.push(`manifest references paths not present in the tarball: ${missing.join(', ')}`);
  }
  if (!hasCjs || !hasMjs) {
    problems.push(`missing dual CJS/ESM output (cjs present: ${hasCjs}, mjs present: ${hasMjs})`);
  }
  if (expectsUmd) {
    if (!hasUmd || !hasUmdMin) {
      problems.push(`missing UMD output (umd present: ${hasUmd}, umd.min present: ${hasUmdMin})`);
    }
    // rollup says this package builds a UMD bundle; the CDN pointer fields are how a
    // consumer actually reaches it, so their absence is a real gap, not a style nit.
    if (typeof manifest.unpkg !== 'string' || typeof manifest.jsdelivr !== 'string') {
      problems.push('rollup config emits a UMD build but the manifest has no unpkg/jsdelivr entry');
    }
  }
  if (declaresLegacyTypesCondition && !hasDownlevelDts) {
    problems.push('exports declares a "types@<range>" condition but no dist/types-ts* output is packed');
  }
  if (!hasAnyCancDep) {
    for (const f of packedFiles) {
      if (/\.d\.(m|c)?ts$/.test(f)) {
        const content = fs.readFileSync(path.join(pkgDir, f), 'utf8');
        if (/(?:from\s+|import\()\s*['"]@cancjs\//.test(content)) {
          problems.push(`dependency-free package ships types containing a bare @cancjs/ import specifier in ${f}`);
        }
      }
    }
  }

  let inspectedDtsCount = 0;
  for (const f of packedFiles) {
    if (/\.d\.(m|c)?ts$/.test(f)) {
      inspectedDtsCount++;
      const content = fs.readFileSync(path.join(pkgDir, f), 'utf8');

      // Check 1: unconditional /['"]packages\// regex test
      if (/['"]packages\//.test(content)) {
        problems.push(`packed types contain a bare packages/ import specifier in ${f}`);
      }

      // Check 2: resolve relative specifiers to assert target exists in tarball
      const matches = [
        ...content.matchAll(/(?:import|export)(?:[\s\S]+?from)?\s*['"](\.\.?[^'"]+)['"]/g),
        ...content.matchAll(/import\(\s*['"](\.\.?[^'"]+)['"]\s*\)/g),
        ...content.matchAll(/require\(\s*['"](\.\.?[^'"]+)['"]\s*\)/g),
      ];

      for (const match of matches) {
        const specifier = match[1];
        const rawTarget = path.join(path.dirname(f), specifier).replace(/\\/g, '/');
        const normalizedTarget = rawTarget.endsWith('/') ? rawTarget.slice(0, -1) : rawTarget;

        let found = false;
        const candidates = [
          normalizedTarget,
          normalizedTarget + '.d.ts',
          normalizedTarget + '.d.mts',
          normalizedTarget + '.d.cts',
          normalizedTarget + '/index.d.ts',
          normalizedTarget + '/index.d.mts',
          normalizedTarget + '/index.d.cts',
        ];

        if (normalizedTarget.match(/\.[mc]?js$/)) {
          candidates.push(normalizedTarget.replace(/\.([mc]?)js$/, '.d.$1ts'));
        }

        for (const candidate of candidates) {
          if (packedFiles.has(candidate)) {
            found = true;
            break;
          }
        }

        if (!found) {
          problems.push(`packed types contain an unresolvable relative import ${specifier} in ${f}`);
        }
      }

      // Check 3: the general form the first two are special cases of. A bare specifier a consumer
      // cannot resolve is a broken declaration whatever its shape, so the `packages/` case above is
      // one instance rather than the whole rule.
      for (const specifier of collectBareSpecifiers(content)) {
        if (!isResolvableBareSpecifier(specifier, manifest)) {
          problems.push(`packed types import ${specifier} in ${f}, which is not a declared dependency or peer`);
        }
      }
    }
  }

  if (inspectedDtsCount === 0) {
    problems.push('package packed zero type declaration (.d.ts) files');
  }

  problems.push(...(await collectDefaultExportShadowing(pkgDir, manifest)));
  problems.push(...collectPeerFloorViolations(pkgDir, manifest, workspace));

  try {
    const publintOutput = execSync(`npx publint "${pkgDir}"`, { encoding: 'utf8' });
    if (publintOutput.includes('Error')) {
      problems.push(`publint reported errors:\n${publintOutput}`);
    }
  } catch (err) {
    problems.push(`publint execution failed:\n${err.stdout || err.message}`);
  }

  try {
    const attwOutput = execSync(`npx attw --pack "${pkgDir}"`, { encoding: 'utf8' });
    if (attwOutput.includes('Problem') || attwOutput.includes('error')) {
      problems.push(`attw reported problems:\n${attwOutput}`);
    }
  } catch (err) {
    problems.push(`attw execution failed:\n${err.stdout || err.message}`);
  }

  return { pkgName: manifest.name, problems, fileCount: packedFiles.size };
}

async function main() {
  const packages = listPackages();
  const workspace = workspacePackages();
  let failed = false;

  for (const pkgName of packages) {
    const { pkgName: name, problems, fileCount } = await checkPackage(pkgName, workspace);
    if (problems.length === 0) {
      console.log(`PASS ${name} (${fileCount} files packed)`);
    } else {
      failed = true;
      console.error(`FAIL ${name}`);
      for (const problem of problems) console.error(`  - ${problem}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { firstPackResult };
