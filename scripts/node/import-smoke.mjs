import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');
const pkgJson = require(path.join(rootDir, 'packages/canc-node/package.json'));

const exportKeys = Object.keys(pkgJson.exports);

async function main() {
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  console.log(`[import-smoke] Running on Node ${process.version} (major ${nodeMajor})`);

  // 1. require + import() every exports key
  for (const key of exportKeys) {
    const specifier = key === '.' ? '@cancjs/node' : `@cancjs/node/${key.replace(/^\.\//, '')}`;
    try {
      const cjsMod = require(specifier);
      assert(cjsMod, `require('${specifier}') returned falsy value`);
    } catch (err) {
      console.error(`FAIL: require('${specifier}') threw:`, err);
      process.exit(1);
    }

    try {
      const esmMod = await import(specifier);
      assert(esmMod, `import('${specifier}') returned falsy value`);
    } catch (err) {
      console.error(`FAIL: import('${specifier}') threw:`, err);
      process.exit(1);
    }
  }

  console.log(`[import-smoke] Verified require + import for all ${exportKeys.length} export subpaths`);

  // 2. Gated promise functions
  const nodeRoot = await import('@cancjs/node');
  const isNotImplemented = (err) => {
    if (!err) return false;
    if (typeof nodeRoot.isNotImplementedError === 'function' && nodeRoot.isNotImplementedError(err)) {
      return true;
    }
    return err.name === 'NotImplementedError' || err._cancErrorBrand === '@cancjs/node:NotImplementedError';
  };

  async function checkGated(subpath, fnName, callFn) {
    try {
      await callFn();
    } catch (err) {
      if (isNotImplemented(err)) {
        return;
      }
      if (subpath === 'dns' && err && (err.code || err.syscall)) {
        return;
      }
      console.error(`FAIL: Gated function ${subpath}.${fnName} threw unexpected error:`, err);
      process.exit(1);
    }
  }

  const cryptoMod = await import('@cancjs/node/crypto');
  await checkGated('crypto', 'argon2', () =>
    cryptoMod.argon2('argon2id', {
      message: 'smoke',
      nonce: '0123456789abcdef',
      parallelism: 1,
      tagLength: 32,
      memory: 8,
      passes: 1,
    }),
  );

  const dnsMod = await import('@cancjs/node/dns');
  await checkGated('dns', 'resolveTlsa', () => dnsMod.resolveTlsa('example.com'));

  const fsMod = await import('@cancjs/node/fs');
  await checkGated('fs', 'statfs', () => fsMod.statfs('.'));

  const streamMod = await import('@cancjs/node/stream');
  await checkGated('stream', 'bytes', () => streamMod.bytes(Readable.from(['smoke'])));

  const wtMod = await import('@cancjs/node/worker-threads');
  await checkGated('worker-threads', 'requestLock', () => wtMod.requestLock('smoke-lock', () => Promise.resolve('ok')));

  const zlibMod = await import('@cancjs/node/zlib');
  await checkGated('zlib', 'zstdCompress', () => zlibMod.zstdCompress(Buffer.from('smoke')));

  console.log(`[import-smoke] Verified gated functions across 6 gated subpaths`);
  console.log(`PASS node built import smoke on Node ${process.version}`);
}

main().catch((err) => {
  console.error('Unhandled smoke error:', err);
  process.exit(1);
});
