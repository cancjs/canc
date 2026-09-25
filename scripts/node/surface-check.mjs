// Runs by CI, cron, or hand.
// Authoritative sequence: check:node-surface (surface:validate -> surface:check)
// owns letters A B C D F G H I J W, letter H reused by error-thrown-check.mjs for another check
import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Resolved from the script location so the check works from any cwd. The override exists for the
// spec that runs this against a throwaway fixture tree; nothing in normal use sets it.
const ROOT = process.env.CANC_SURFACE_ROOT || join(HERE, '..', '..');
const surfaceDir = join(ROOT, 'packages', 'canc-node', 'surface');
const nodeLock = JSON.parse(readFileSync(join(surfaceDir, 'node-api.lock.json'), 'utf8'));
const rtLock = JSON.parse(readFileSync(join(surfaceDir, 'runtime.lock.json'), 'utf8'));
const exclusions = JSON.parse(readFileSync(join(surfaceDir, 'exclusions.json'), 'utf8'));

const manifests = [];
for (const file of readdirSync(surfaceDir)) {
  if (
    file.endsWith('.json') &&
    !['node-api.lock.json', 'runtime.lock.json', 'schema.json', 'exclusions.json'].includes(file)
  ) {
    manifests.push(JSON.parse(readFileSync(join(surfaceDir, file), 'utf8')));
  }
}

// a subpath name is not always the node lock's module key: `child-process` is `child_process`
// there, and a synthetic `fs#FileHandle` key carries its own suffix
function toModKey(subpath, nodeSpecifier) {
  const base = subpath.split('#')[0];
  if (nodeLock.modules[base]) return base;
  if (nodeSpecifier) {
    const specMod = nodeSpecifier.replace(/^node:/, '').split('/')[0];
    if (nodeLock.modules[specMod]) return specMod;
  }
  const unhyphenated = base.replace(/-/g, '_');
  if (nodeLock.modules[unhyphenated]) return unhyphenated;
  return base;
}

// a manifest with no nodeSpecifier describes exports that are ours, not node's, so it covers no
// node module and must not be read as removing every export from one
const coveredModules = new Set(
  manifests.filter((m) => m.nodeSpecifier !== null).map((m) => toModKey(m.subpath, m.nodeSpecifier)),
);
// a module-level entry (no "key") drops every lock fact for that module; a keyed entry drops
// exactly one lock fact, for a name that is real but does not survive to the newest major
// (a doc-structure artifact rather than a removal worth failing the build over)
const exModules = new Set(exclusions.filter((e) => e.module && !e.key).map((e) => e.module));
const exNames = new Set(exclusions.filter((e) => e.name).map((e) => e.name));
const exKeys = new Set(exclusions.filter((e) => e.key).map((e) => `${e.module}::${e.key}`));

let failed = false;
function fail(msg) {
  console.error(msg);
  failed = true;
}
function warn(msg) {
  console.warn(msg);
}

// every exclusion entry exists so a reviewer can tell "not shipped" from "forgotten" -- an empty
// reason defeats that, so it is a fail, not a lint nit
for (const entry of exclusions) {
  const label = entry.module ? `module ${entry.module}` : `name ${entry.name}`;
  if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
    fail(`Check A failed: exclusion entry for ${label} has no reason`);
  }
}

const manifestMap = new Map();
for (const m of manifests) {
  if (!manifestMap.has(m.subpath)) manifestMap.set(m.subpath, new Map());
  for (const exp of m.exports) {
    manifestMap.get(m.subpath).set(exp.name, exp);
  }
}

const newestMajor = Object.keys(nodeLock.generatedFrom)
  .map(Number)
  .sort((a, b) => b - a)[0];

// Class families a phase deliberately did not wrap or catalog member-by-member (out-of-scope
// fence recorded in the phase task, not a module exclusion). Keyed by top-level module, value is
// the set of class names (matched as the lock key's second segment) to skip entirely, both the
// class declaration and every member under it.
const OUT_OF_SCOPE_CLASSES = {
  zlib: new Set(['ZipEntry', 'ZipFile']),
};

for (const [mod, lockExports] of Object.entries(nodeLock.modules)) {
  if (exModules.has(mod)) continue;
  if (!coveredModules.has(mod)) {
    // a lock module that is neither manifested nor in the exclusion register is a silent gap:
    // nobody decided "not shipped" or "forgotten" for it
    fail(`Check A failed: uncovered module ${mod} (no manifest, no exclusion entry)`);
    continue;
  }

  const fencedClasses = OUT_OF_SCOPE_CLASSES[mod];

  for (const [lockKey, lockVal] of Object.entries(lockExports)) {
    if (exKeys.has(`${mod}::${lockKey}`)) continue;

    const prefix = lockKey.split('.')[0];
    if (
      prefix.includes('callback') ||
      (prefix.includes('synchronous') && !prefix.includes('asynchronous')) ||
      prefix === 'common_objects' ||
      prefix === 'classes' ||
      prefix === 'child_process'
    ) {
      continue;
    }

    if (fencedClasses && fencedClasses.has(lockKey.split('.')[1])) continue;

    const parts = lockKey.includes('[') ? lockKey.replace(/\[.*?\]/, 'SYMBOL').split('.') : lockKey.split('.');
    const name = lockKey.includes('[') ? lockKey.slice(lockKey.indexOf('[')) : parts.pop();
    if (
      name === 'Type' ||
      name === 'FileHandle' ||
      name.startsWith('[Symbol') ||
      name === 'detached' ||
      name === 'stdio'
    )
      continue;
    if (exNames.has(name)) continue;

    const targetManifest = manifests.find(
      (m) =>
        toModKey(m.subpath, m.nodeSpecifier) === mod &&
        (parts.length > 1 ? m.subpath.includes('#' + parts.slice(1).join('.')) : !m.subpath.includes('#')),
    );
    const subpath =
      targetManifest ? targetManifest.subpath
      : parts.length > 1 ? `${mod}#${parts.slice(1).join('.')}`
      : mod;

    const mmap = manifestMap.get(subpath);
    const mentry = mmap ? mmap.get(name) : null;

    if (!mentry) {
      fail(`Check A failed: uncovered export ${mod} ${lockKey}`);
      continue;
    }

    const signalMajors = lockVal.signalIn || [];
    if (signalMajors.length > 0) {
      const hasSignal = mentry.nodeSignal && mentry.nodeSignal.since !== null;
      // passthrough, promisify-callback, and constructor-teardown forward caller options
      // untouched to node, so node signal support reaches the runtime as documented
      const isSignalWrapper =
        mentry.wrapper === 'cancelify-signal' ||
        mentry.wrapper === 'cancelify-teardown' ||
        mentry.wrapper === 'constructor-teardown' ||
        mentry.wrapper === 'gated' ||
        mentry.wrapper === 'passthrough' ||
        mentry.wrapper === 'promisify-callback' ||
        mentry.wrapper === 'promisify-custom';
      if (!hasSignal || !isSignalWrapper) {
        const firstMajor = Math.min(...signalMajors);
        const sinceVer = nodeLock.generatedFrom[firstMajor] || `v${firstMajor}`;
        fail(
          `Check B failed: ${lockKey} (in ${mod}) has signalIn [${signalMajors.join(',')}] (e.g. ${sinceVer}) but manifest nodeSignal.since=${mentry.nodeSignal?.since} wrapper=${mentry.wrapper}`,
        );
      }
    }

    if (mentry.nodeSignal && mentry.nodeSignal.since) {
      const sinceMajor = parseInt(mentry.nodeSignal.since.slice(1).split('.')[0], 10);
      const isPreFloor = sinceMajor < 18;
      if (!isPreFloor) {
        const sinceByMajor = mentry.nodeSignal.sinceByMajor || {};
        const byMajorKeys = Object.keys(sinceByMajor).map(Number);
        for (const major of signalMajors) {
          if (!byMajorKeys.includes(major)) {
            fail(
              `Check C failed: ${mod} ${lockKey} manifest is missing major ${major} (consequence: gate is too narrow / drops cancellation)`,
            );
          }
        }
        for (const major of byMajorKeys) {
          if (!signalMajors.includes(major)) {
            fail(
              `Check C failed: ${mod} ${lockKey} major ${major} is not in signalIn (consequence: unknown option key / Deno ERR_INVALID_ARG_TYPE)`,
            );
          }
        }
      }
    }

    if (mentry.wrapper && mentry.wrapper.startsWith('cancelify')) {
      const majors = Object.keys(lockVal.optionKeys || {})
        .map(Number)
        .sort((a, b) => b - a);
      if (majors.length >= 2) {
        const newestKeys = lockVal.optionKeys[majors[0]] || [];
        const prevKeys = lockVal.optionKeys[majors[1]] || [];
        if (newestKeys.join(',') !== prevKeys.join(',')) {
          warn(
            `Check E warning: ${mod} ${lockKey} optionKeys changed from ${prevKeys.join(',')} to ${newestKeys.join(',')}`,
          );
        }
      }
    }

    for (const env of ['deno', 'bun']) {
      if (
        mentry.runtime &&
        mentry.runtime[env] === 'ok' &&
        mentry.kind !== 'type' &&
        mentry.kind !== 'namespace' &&
        !name.startsWith('[Symbol')
      ) {
        if (subpath.includes('#FileHandle')) {
          const p = rtLock[env]?.fileHandle?.prototypeMembers || [];
          const o = rtLock[env]?.fileHandle?.ownFunctionMembers || [];
          if (!p.includes(name) && !o.includes(name)) {
            fail(`Check F failed: ${name} marked ok on ${env} but missing from FileHandle`);
          }
        } else {
          // find the correct node specifier from manifest
          let specifier = null;
          for (const m of manifests) {
            if (m.subpath === subpath) {
              if (m.nodeSpecifier) {
                specifier = m.nodeSpecifier.replace(/^node:/, '');
              }
              break;
            }
          }
          if (specifier) {
            const rtKeys = rtLock[env]?.exports?.[specifier]?.keys || [];
            if (!rtKeys.includes(name)) {
              fail(`Check F failed: ${name} marked ok on ${env} but missing from runtime exports for ${specifier}`);
            }
          }
        }
      }
    }
  }
}

// Entries the doc extraction shows on an older tracked major but not on the newest one: real
// removals (deprecated no-iv cipher API dropped from the docs after 20), not gaps in coverage.
// Check A above already requires these be cataloged because they are still real on older majors;
// this set only exempts them from the "must also exist on the newest major" direction.
/**
 * Drop the ` extends Base` a Node doc heading carries. The lock keys a class section by its rendered
 * heading (`BroadcastChannel extends EventTarget`) while a manifest names the class alone, so the
 * two only line up once the clause is gone.
 */
function stripExtendsClause(key) {
  return key
    .split('.')
    .map((segment) => segment.replace(/\s+extends\s+.*$/, ''))
    .join('.');
}

/**
 * The `node:<mod>/<sub>` a manifest export belongs to, when its own entry declares one. An export
 * may live in a different specifier than the manifest it is listed under: the `stream` manifest
 * carries the `node:stream/consumers` members because that is where a consumer reaches them from.
 */
function submoduleOf(manifest, name) {
  const entry = (manifest.exports || []).find((e) => e.name === name);
  const specifier = entry?.nodeSpecifier;

  return specifier && specifier.includes('/') ? specifier.replace(/^node:/, '') : undefined;
}

/** Member names the runtime probe actually found on a submodule. */
function runtimeKeysOf(submodule) {
  return rtLock.node?.exports?.[submodule]?.keys || [];
}

const REMOVED_BY_NEWEST_MAJOR = new Set([
  'stream#stream.Readable::asIndexedPairs',
  'crypto::Cipher',
  'crypto::Decipher',
  'crypto::createCipher',
  'crypto::createDecipher',
  'crypto::DEFAULT_ENCODING',
  'crypto#Cipher::final',
  'crypto#Cipher::getAuthTag',
  'crypto#Cipher::setAAD',
  'crypto#Cipher::setAutoPadding',
  'crypto#Cipher::update',
  'crypto#Decipher::final',
  'crypto#Decipher::setAAD',
  'crypto#Decipher::setAuthTag',
  'crypto#Decipher::setAutoPadding',
  'crypto#Decipher::update',
  'zlib#ZlibBase::bytesRead',
  'zlib#ZlibBase::crc32',
]);

for (const [subpath, mmap] of manifestMap.entries()) {
  const manifest = manifests.find((m) => m.subpath === subpath);
  if (!manifest || manifest.nodeSpecifier === null) continue;
  const mod = toModKey(manifest.subpath, manifest.nodeSpecifier);
  for (const [name, _mentry] of mmap.entries()) {
    if (name === 'Type' || name === 'FileHandle' || name.startsWith('[Symbol')) continue;
    if (REMOVED_BY_NEWEST_MAJOR.has(`${subpath}::${name}`)) continue;
    const lockExports = nodeLock.modules[mod] || {};
    const prefix = subpath.includes('#') ? subpath.split('#')[1] + '.' + name : name;

    // Every key that names this API, not the first. Node renames a class heading between majors
    // (`BroadcastChannel` became `BroadcastChannel extends EventTarget` in 26), which leaves the
    // lock holding one key per spelling, each carrying only the majors that used it. Taking the
    // first match reports the API as gone from the newest major purely because the heading moved.
    const matches = Object.entries(lockExports).filter(([k, _v]) => {
      const p = k.split('.');
      p.shift();
      return stripExtendsClause(p.join('.')) === stripExtendsClause(prefix);
    });

    if (matches.length > 0) {
      if (!matches.some(([, v]) => v.presentIn.includes(newestMajor))) {
        fail(`Check D failed: ${subpath} ${name} has no lock counterpart on newest major`);
      }
      continue;
    }

    // The doc-scraped lock only covers whole modules. A member of a submodule it never collected
    // (`node:stream/consumers`) has no counterpart there and never will, so it is checked against
    // the runtime probe instead of being failed against data that was not gathered.
    const submodule = submoduleOf(manifest, name);

    if (submodule && runtimeKeysOf(submodule).includes(name)) {
      continue;
    }

    fail(`Check D failed: ${subpath} ${name} has no lock counterpart on newest major`);
  }
}

// Check W: wrapper matches combinator actually used in index.ts / file-handle.ts
const fsIndexPath = join(ROOT, 'packages', 'canc-node', 'src', 'fs', 'index.ts');
const fileHandlePath = join(ROOT, 'packages', 'canc-node', 'src', 'fs', 'file-handle.ts');

if (existsSync(fsIndexPath)) {
  const fsIndexSrc = readFileSync(fsIndexPath, 'utf8');
  const exportCombinators = new Map();
  const exportRe = /export\s+const\s+(\w+)\s*=\s*([a-zA-Z0-9_$.]+)/g;
  for (const match of fsIndexSrc.matchAll(exportRe)) {
    const [, expName, rhs] = match;
    exportCombinators.set(expName, rhs);
  }

  const COMBINATOR_MAP = {
    adopted: 'promisify-custom',
    promisifyWrapped: 'promisify-callback',
    promisifySignalWrapped: 'cancelify-signal',
    teardownOpen: 'cancelify-teardown',
    gatedWrapped: 'gated',
    passthrough: 'passthrough',
    'nodeFsPromises.constants': 'passthrough',
  };

  const fsManifest = manifestMap.get('fs');
  if (fsManifest) {
    for (const [name, mentry] of fsManifest.entries()) {
      const combinator = exportCombinators.get(name);
      if (!combinator) {
        fail(`Check W failed: fs export ${name} not found in ${fsIndexPath}`);
        continue;
      }
      const expectedWrapper = COMBINATOR_MAP[combinator];
      if (!expectedWrapper) {
        fail(`Check W failed: fs export ${name} uses unknown combinator ${combinator}`);
        continue;
      }
      if (mentry.wrapper !== expectedWrapper) {
        fail(
          `Check W failed: fs export ${name} uses combinator ${combinator} in index.ts but manifest wrapper is ${mentry.wrapper} (expected ${expectedWrapper})`,
        );
      }
    }
  }
}

if (existsSync(fileHandlePath)) {
  const fileHandleSrc = readFileSync(fileHandlePath, 'utf8');
  const switchCases = new Set([...fileHandleSrc.matchAll(/case\s+'([^']+)'/g)].map((m) => m[1]));

  const EXPECTED_HANDLE_WRAPPERS = {
    appendFile: 'cancelify-signal',
    close: 'passthrough',
    read: 'promisify-custom',
    readFile: 'cancelify-signal',
    readv: 'promisify-custom',
    stat: 'gated',
    write: 'promisify-custom',
    writeFile: 'cancelify-signal',
    writev: 'promisify-custom',
  };

  const handleManifest = manifestMap.get('fs#FileHandle');
  if (handleManifest) {
    for (const [name, mentry] of handleManifest.entries()) {
      const expectedWrapper = EXPECTED_HANDLE_WRAPPERS[name] || 'passthrough';
      if (mentry.wrapper !== expectedWrapper) {
        fail(
          `Check W failed: FileHandle member ${name} routing expects wrapper ${expectedWrapper} but manifest has ${mentry.wrapper}`,
        );
      }
      if (mentry.kind === 'fn' && mentry.callPath !== 'sync' && name !== 'close') {
        if (!switchCases.has(mentry.wrapper)) {
          fail(
            `Check W failed: FileHandle member ${name} wrapper ${mentry.wrapper} not handled in file-handle.ts switch`,
          );
        }
      }
    }
  }
}

// Guarded on the tree under test, not on the script: `CANC_SURFACE_ROOT` can point at a
// surface-only fixture, and a docs check has nothing to compare against there.
const surfaceDocsPath = join(HERE, 'surface-docs.mjs');
if (existsSync(surfaceDocsPath) && existsSync(join(ROOT, 'packages', 'canc-node', 'README.md'))) {
  try {
    // cwd: ROOT, not inherited from the caller -- surface-docs.mjs's own module resolution
    // (and, transitively, TypeScript's) is anchored to the process cwd, not to argv[1]
    execSync(`node "${surfaceDocsPath}" --check`, { stdio: 'inherit', cwd: ROOT });
  } catch (_err) {
    fail(`Check G failed: generated docs stale`);
  }
}

// Check H: nodeSpecifier: null manifests match built exports, and README table cells match manifest
for (const manifest of manifests) {
  if (manifest.nodeSpecifier !== null) continue;
  const pkgJsonPath = join(ROOT, 'packages', 'canc-node', 'package.json');
  if (!existsSync(pkgJsonPath)) continue;
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const exportEntry = pkgJson.exports?.[`./${manifest.subpath}`];
  const importTarget =
    typeof exportEntry === 'string' ? exportEntry : (
      exportEntry?.import?.default || exportEntry?.default || `./dist/${manifest.subpath}.mjs`
    );
  const builtModPath = join(ROOT, 'packages', 'canc-node', importTarget);
  if (!existsSync(builtModPath)) {
    fail(`Check H failed: built module for ${manifest.subpath} does not exist at ${builtModPath}`);
    continue;
  }
  const { pathToFileURL } = await import('node:url');
  let builtMod;
  try {
    builtMod = await import(pathToFileURL(builtModPath).href);
  } catch (err) {
    fail(`Check H failed: could not import built module for ${manifest.subpath}: ${err.message}`);
    continue;
  }
  for (const exp of manifest.exports) {
    if (exp.kind === 'type') continue;
    if (!(exp.name in builtMod)) {
      fail(`Check H failed: export ${exp.name} in manifest ${manifest.subpath} not found on built namespace`);
    }
  }
}

const readmePath = join(ROOT, 'packages', 'canc-node', 'README.md');
if (existsSync(readmePath)) {
  const readmeContent = readFileSync(readmePath, 'utf8');
  const cellRegex = /`([^`]+)`\s*\(`?@cancjs\/node\/fs\/extra`?\)/g;
  const extraManifest = manifests.find((m) => m.subpath === 'fs/extra');
  let match;
  while ((match = cellRegex.exec(readmeContent)) !== null) {
    const name = match[1];
    if (!extraManifest) {
      fail(`Check H failed: README references @cancjs/node/fs/extra but no matching manifest exists`);
      break;
    }
    const hasExport = extraManifest.exports.some((e) => e.name === name);
    if (!hasExport) {
      fail(
        `Check H failed: README references \`${name}\` (\`@cancjs/node/fs/extra\`) but name is not in fs/extra manifest`,
      );
    }
  }
}

// Checks A through G compare the manifest to node's API. Check I is the other direction: what the
// package actually publishes, read off the built declarations, against the committed record of it.
// Same guard as the docs check: the baseline is read off built declarations, which a fixture tree
// does not carry.
const surfaceBaselinePath = join(HERE, 'surface-baseline.mjs');
if (existsSync(surfaceBaselinePath) && existsSync(join(ROOT, 'packages', 'canc-node', 'dist'))) {
  try {
    execSync(`node "${surfaceBaselinePath}" --check`, { stdio: 'inherit', cwd: ROOT });
  } catch (_err) {
    fail(`Check I failed: the published surface does not match its baseline`);
  }
}

// Check J: no manifest-only field reaches the published bundles.
// A src module that imports a raw surface/*.json instead of the projected/ view leaks it whole.
// ALLOWED_IN_DIST names every field a real consumer reads, swept against the built output.
const distDir = join(ROOT, 'packages', 'canc-node', 'dist');
if (existsSync(distDir)) {
  const ALLOWED_IN_DIST = new Set([
    'name',
    'exports',
    'nodeSignal',
    'documented',
    'since',
    'sinceByMajor',
    'probed',
    'kind',
    'wrapper',
    'adopted',
    'minMajor',
    'gate',
    'callPath',
  ]);

  const manifestOnlyKeys = new Set();
  for (const manifest of manifests) {
    for (const exp of manifest.exports || []) {
      for (const key of Object.keys(exp)) {
        if (!ALLOWED_IN_DIST.has(key)) manifestOnlyKeys.add(key);
      }
    }
  }

  function collectFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...collectFiles(full));
      else if (entry.name.endsWith('.cjs') || entry.name.endsWith('.mjs')) out.push(full);
    }
    return out;
  }

  const distFiles = collectFiles(distDir);
  for (const key of manifestOnlyKeys) {
    for (const file of distFiles) {
      const contents = readFileSync(file, 'utf8');
      if (contents.includes(`"${key}"`) || contents.includes(`${key}:`)) {
        fail(
          `Check J failed: manifest-only field "${key}" found in ${file} (surface manifest inlined into the bundle)`,
        );
        break;
      }
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  process.exit(0);
}
