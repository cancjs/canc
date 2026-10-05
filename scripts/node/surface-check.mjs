// Runs by CI, cron, or hand.
// Authoritative sequence: check:node-surface (surface:validate -> surface:check)
import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const surfaceDir = 'packages/canc-node/surface';
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
const exModules = new Set(exclusions.filter((e) => e.module).map((e) => e.module));
const exNames = new Set(exclusions.filter((e) => e.name).map((e) => e.name));

let failed = false;
let _warnings = false;
function fail(msg) {
  console.error(msg);
  failed = true;
}
function warn(msg) {
  console.warn(msg);
  _warnings = true;
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

for (const [mod, lockExports] of Object.entries(nodeLock.modules)) {
  if (exModules.has(mod)) continue;
  if (!coveredModules.has(mod)) continue;

  for (const [lockKey, lockVal] of Object.entries(lockExports)) {
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

for (const [subpath, mmap] of manifestMap.entries()) {
  const manifest = manifests.find((m) => m.subpath === subpath);
  if (!manifest || manifest.nodeSpecifier === null) continue;
  const mod = toModKey(manifest.subpath, manifest.nodeSpecifier);
  for (const [name, _mentry] of mmap.entries()) {
    if (name === 'Type' || name === 'FileHandle' || name.startsWith('[Symbol')) continue;
    const lockExports = nodeLock.modules[mod] || {};
    const prefix = subpath.includes('#') ? subpath.split('#')[1] + '.' + name : name;

    const match = Object.entries(lockExports).find(([k, _v]) => {
      const p = k.split('.');
      p.shift();
      return p.join('.') === prefix;
    });

    if (!match || !match[1].presentIn.includes(newestMajor)) {
      fail(`Check D failed: ${subpath} ${name} has no lock counterpart on newest major`);
    }
  }
}

// Check W: wrapper matches combinator actually used in index.ts / file-handle.ts
const fsIndexPath = 'packages/canc-node/src/fs/index.ts';
const fileHandlePath = 'packages/canc-node/src/fs/file-handle.ts';

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

if (existsSync('scripts/node/surface-docs.mjs')) {
  try {
    execSync('node scripts/node/surface-docs.mjs --check', { stdio: 'inherit' });
  } catch (_err) {
    fail(`Check G failed: generated docs stale`);
  }
}

// Check H: nodeSpecifier: null manifests match built exports, and README table cells match manifest
for (const manifest of manifests) {
  if (manifest.nodeSpecifier !== null) continue;
  const pkgJsonPath = join('packages/canc-node/package.json');
  if (!existsSync(pkgJsonPath)) continue;
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const exportEntry = pkgJson.exports?.[`./${manifest.subpath}`];
  const importTarget =
    typeof exportEntry === 'string' ? exportEntry : (
      exportEntry?.import?.default || exportEntry?.default || `./dist/${manifest.subpath}.mjs`
    );
  const builtModPath = join(process.cwd(), 'packages/canc-node', importTarget);
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

const readmePath = join('packages/canc-node/README.md');
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

if (failed) {
  process.exit(1);
} else {
  process.exit(0);
}
