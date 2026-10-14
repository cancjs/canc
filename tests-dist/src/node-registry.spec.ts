import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const distNodeIndex = path.resolve(__dirname, '../../packages/canc-node/dist/index.cjs');

if (!fs.existsSync(distNodeIndex)) {
  throw new Error('Run "npm run build" before "npm run test:dist"');
}

const repoRoot = path.resolve(__dirname, '../..');

function runCjs(code: string): void {
  execFileSync(
    process.execPath,
    ['-e', `(async () => { ${code} })().catch((err) => { console.error(err); process.exit(1); });`],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
}

function runEsm(code: string): void {
  execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

describe('node package cross-subpath registry and error identity (CommonJS)', () => {
  it('importing register-graceful routes readFile through graceful-fs', () => {
    runCjs(`
      const assert = require('node:assert/strict');
      const gracefulFs = require('graceful-fs');
      let spyCalled = false;
      const origReadFile = gracefulFs.readFile;
      gracefulFs.readFile = (...args) => {
        spyCalled = true;
        return origReadFile.apply(gracefulFs, args);
      };
      require('@cancjs/node/fs/register-graceful');
      const { getFs, readFile } = require('@cancjs/node/fs');
      const path = require('node:path');
      assert.equal(getFs(), gracefulFs);
      await readFile(path.resolve(process.cwd(), 'package.json'));
      assert.equal(spyCalled, true);
    `);
  });

  it('ensureDir from fs/extra reaches the registered file system', () => {
    runCjs(`
      const assert = require('node:assert/strict');
      const nodeFs = require('node:fs');
      const { setFs, resetFs } = require('@cancjs/node/fs');
      const { ensureDir } = require('@cancjs/node/fs/extra');
      let mkdirCalled = false;
      const fakeFs = {
        ...nodeFs,
        promises: {
          ...nodeFs.promises,
          mkdir: async () => {
            mkdirCalled = true;
          },
        },
      };
      setFs(fakeFs);
      try {
        await ensureDir(__dirname);
        assert.equal(mkdirCalled, true);
      } finally {
        resetFs();
      }
    `);
  });

  it('child-process error is instanceof the root ProcessExitError', () => {
    runCjs(`
      const assert = require('node:assert/strict');
      const { ProcessExitError } = require('@cancjs/node');
      const { spawn } = require('@cancjs/node/child-process');
      const child = spawn(process.execPath, ['-e', 'process.exit(42)']);
      let thrown = null;
      try {
        await child.promise;
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown);
      assert.equal(thrown instanceof ProcessExitError, true);
    `);
  });

  it('zlib error is instanceof the root NotImplementedError', () => {
    runCjs(`
      const assert = require('node:assert/strict');
      const { NotImplementedError } = require('@cancjs/node');
      const { ZipBuffer } = require('@cancjs/node/zlib');
      let thrown = null;
      try {
        new ZipBuffer();
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown);
      assert.equal(thrown instanceof NotImplementedError, true);
    `);
  });
});

describe('node package cross-subpath registry and error identity (ESM)', () => {
  it('importing register-graceful routes readFile through graceful-fs', () => {
    runEsm(`
      import assert from 'node:assert/strict';
      import gracefulFs from 'graceful-fs';
      import path from 'node:path';

      let spyCalled = false;
      const origReadFile = gracefulFs.readFile;
      gracefulFs.readFile = (...args) => {
        spyCalled = true;
        return origReadFile.apply(gracefulFs, args);
      };
      await import('@cancjs/node/fs/register-graceful');
      const { getFs, readFile } = await import('@cancjs/node/fs');
      assert.equal(getFs(), gracefulFs);
      await readFile(path.resolve(process.cwd(), 'package.json'));
      assert.equal(spyCalled, true);
    `);
  });

  it('ensureDir from fs/extra reaches the registered file system', () => {
    runEsm(`
      import assert from 'node:assert/strict';
      import nodeFs from 'node:fs';
      import { fileURLToPath } from 'node:url';
      import { setFs, resetFs } from '@cancjs/node/fs';
      import { ensureDir } from '@cancjs/node/fs/extra';

      let mkdirCalled = false;
      const fakeFs = {
        ...nodeFs,
        promises: {
          ...nodeFs.promises,
          mkdir: async () => {
            mkdirCalled = true;
          },
        },
      };
      setFs(fakeFs);
      try {
        await ensureDir(fileURLToPath(import.meta.url));
        assert.equal(mkdirCalled, true);
      } finally {
        resetFs();
      }
    `);
  });

  it('child-process error is instanceof the root ProcessExitError', () => {
    runEsm(`
      import assert from 'node:assert/strict';
      import { ProcessExitError } from '@cancjs/node';
      import { spawn } from '@cancjs/node/child-process';

      const child = spawn(process.execPath, ['-e', 'process.exit(42)']);
      let thrown = null;
      try {
        await child.promise;
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown);
      assert.equal(thrown instanceof ProcessExitError, true);
    `);
  });

  it('zlib error is instanceof the root NotImplementedError', () => {
    runEsm(`
      import assert from 'node:assert/strict';
      import { NotImplementedError } from '@cancjs/node';
      import { ZipBuffer } from '@cancjs/node/zlib';

      let thrown = null;
      try {
        new ZipBuffer();
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown);
      assert.equal(thrown instanceof NotImplementedError, true);
    `);
  });
});

describe('node package built bundle error class containment', () => {
  function getBundleFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getBundleFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.cjs') || entry.name.endsWith('.mjs'))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('no node error class is created outside the root bundle', () => {
    const distDir = path.resolve(__dirname, '../../packages/canc-node/dist');
    const bundleFiles = getBundleFiles(distDir);
    const nonRootFiles = bundleFiles.filter((f) => !path.basename(f).startsWith('index.'));

    expect(nonRootFiles.length).toBeGreaterThan(0);

    const nodeErrorPattern =
      /createErrorClass\([^)]*(?:@cancjs\/node:|['"](?:NotImplementedError|ProcessExitError|ProcessSpawnError|JsonParseError)['"])/;

    for (const filePath of nonRootFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const nodeErrorMatch = nodeErrorPattern.exec(content);
      if (nodeErrorMatch) {
        const relative = path.relative(distDir, filePath);
        throw new Error(`Found node error class creation in ${relative}: ${nodeErrorMatch[0]}`);
      }
    }
  });
});
