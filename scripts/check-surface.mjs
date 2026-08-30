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
      const isSignalWrapper =
        mentry.wrapper === 'cancelify-signal' || mentry.wrapper === 'cancelify-teardown' || mentry.wrapper === 'gated';
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
      if (!isPreFloor && mentry.nodeSignal.sinceByMajor) {
        const byMajorKeys = Object.keys(mentry.nodeSignal.sinceByMajor).map(Number);
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

if (existsSync('scripts/gen-surface-docs.mjs')) {
  try {
    execSync('node scripts/gen-surface-docs.mjs --check', { stdio: 'inherit' });
  } catch (_err) {
    fail(`Check G failed: generated docs stale`);
  }
}

if (failed) {
  process.exit(1);
} else {
  process.exit(0);
}
