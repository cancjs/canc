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

const coveredModules = new Set(manifests.map((m) => m.subpath.split('#')[0]));
const exModules = new Set(exclusions.map((e) => e.module));

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
      prefix.includes('synchronous') ||
      prefix === 'common_objects' ||
      prefix === 'classes'
    ) {
      continue;
    }

    const parts = lockKey.includes('[') ? lockKey.replace(/\[.*?\]/, 'SYMBOL').split('.') : lockKey.split('.');
    const name = lockKey.includes('[') ? lockKey.slice(lockKey.indexOf('[')) : parts.pop();
    const subpath = parts.length > 1 ? `${mod}#${parts.slice(1).join('.')}` : mod;

    if (name === 'Type' || name === 'FileHandle' || name.startsWith('[Symbol')) continue;

    const mmap = manifestMap.get(subpath);
    const mentry = mmap ? mmap.get(name) : null;

    if (!mentry) {
      fail(`Check A failed: uncovered export ${mod} ${lockKey}`);
      continue;
    }

    const signalMajors = lockVal.signalIn || [];
    if (signalMajors.length > 0) {
      const hasSignal = mentry.nodeSignal && mentry.nodeSignal.since !== null;
      // passthrough counts: it hands node the caller's arguments untouched, so a signal in the
      // options bag reaches node the way node documents. That is the case for the members returning
      // an async iterable or stream, where there is no promise to carry a cancel in the first place
      const isSignalWrapper =
        mentry.wrapper === 'cancelify-signal' ||
        mentry.wrapper === 'cancelify-teardown' ||
        mentry.wrapper === 'gated' ||
        (mentry.wrapper === 'passthrough' &&
          (name === 'watch' || name === 'glob' || name === 'createReadStream' || name === 'pull'));
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
              specifier = m.nodeSpecifier.replace(/^node:/, '');
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
  const mod = subpath.split('#')[0];
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

if (failed) {
  process.exit(1);
} else {
  process.exit(0);
}
