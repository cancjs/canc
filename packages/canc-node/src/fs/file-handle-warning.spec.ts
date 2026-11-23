import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const hook = `
  const ts = require(${JSON.stringify(require.resolve('typescript'))});
  const Module = require('node:module');
  const fs = require('node:fs');
  const original = Module._resolveFilename;
  Module._resolveFilename = function (name, ...rest) {
    if (name === '@cancjs/promise') return ${JSON.stringify(resolve(__dirname, '../../../canc-promise/src/index.ts'))};
    if (name === '@cancjs/node') return ${JSON.stringify(resolve(__dirname, '../errors/classes.ts'))};
    return original.call(this, name, ...rest);
  };
  Module._extensions['.ts'] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        esModuleInterop: true,
        downlevelIteration: true,
        useDefineForClassFields: false,
      }
    }).outputText, filename);
  };
`;

const probe = `
  const assert = require('node:assert/strict');
  const native = require('node:fs/promises');
  const { open } = require(${JSON.stringify(resolve(__dirname, 'index.ts'))});
  (async () => {
    const sample = await native.open('package.json', 'r');
    const proto = Object.getPrototypeOf(sample);
    const hasReadLines = typeof sample.readLines === 'function';
    const hasDispose = typeof Symbol.asyncDispose === 'symbol' && typeof sample[Symbol.asyncDispose] === 'function';
    const mode = process.argv[1];
    const removed = mode === 'broken' ? ['readFile', ...(hasReadLines ? ['readLines'] : [])] : [];
    const descriptors = removed.map(name => [name, Object.getOwnPropertyDescriptor(proto, name)]);
    await sample.close();
    try {
      for (const name of removed) assert.ok(delete proto[name]);
      for (let i = 0; i < 2; i++) {
        const handle = await open('package.json', 'r');
        try {
          assert.ok((await handle.stat()).size > 0);
          assert.equal(typeof handle.readLines === 'function', hasReadLines && !removed.includes('readLines'));
          assert.equal(typeof Symbol.asyncDispose === 'symbol' && typeof handle[Symbol.asyncDispose] === 'function', hasDispose);
        } finally {
          await handle.close();
        }
      }
      console.log(JSON.stringify({ version: process.version, hasReadLines, hasDispose }));
    } finally {
      for (const [name, descriptor] of descriptors) if (descriptor) Object.defineProperty(proto, name, descriptor);
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
`;

function runtimePath(prefix: string, packageName: string): string {
  return join(prefix, 'node_modules', packageName, 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
}

// Windows can transiently retain filesystem entries even after a synchronous child exits.
// Use explicit retries: recursive native retries can repeat at more than one directory level.
async function removeOwnedPrefix(
  prefix: string,
  remove = rm,
  wait: (ms: number) => Promise<void> = delay,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await remove(prefix, { recursive: true, force: true, maxRetries: 0 });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt === 5 || !['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM'].includes(code ?? '')) {
        throw error;
      }
      await wait(100 * (attempt + 1));
    }
  }
}

async function withOwnedPrefix(prefix: string, run: () => void, cleanup = removeOwnedPrefix): Promise<void> {
  try {
    run();
  } catch (probeError) {
    try {
      await cleanup(prefix);
    } catch (cleanupError) {
      throw new AggregateError([probeError, cleanupError], 'Native probe and fixture cleanup both failed', {
        cause: cleanupError,
      });
    }
    throw probeError;
  }
  await cleanup(prefix);
}

async function withNode180(run: (node: string) => void): Promise<void> {
  const packageName = `node-${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`;
  const cached = runtimePath(join(tmpdir(), 'canc', 'p116e-node180'), packageName);
  if (process.version === 'v18.0.0') {
    run(process.execPath);
  } else if (process.env.CANC_NODE180 || existsSync(cached)) {
    run(process.env.CANC_NODE180 ?? cached);
  } else {
    // Provision the exact host in an isolated prefix; no workspace install is changed.
    const base = join(tmpdir(), 'canc');
    mkdirSync(base, { recursive: true });
    const prefix = mkdtempSync(join(base, 'file-handle-host-'));
    await withOwnedPrefix(prefix, () => {
      const npm = process.env.npm_execpath;
      if (!npm) throw new Error('The exact Node 18.0.0 probe requires CANC_NODE180 or the npm test entry point');
      // Avoid inheriting workspace allowScripts in the isolated script-free install
      const env = { ...process.env };
      for (const key of Object.keys(env)) {
        if (key.toLowerCase() === 'npm_config_allow_scripts') delete env[key];
      }
      const result = spawnSync(
        process.execPath,
        [
          npm,
          'install',
          '--prefix',
          prefix,
          '--no-save',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          `${packageName}@18.0.0`,
        ],
        { cwd: prefix, env, encoding: 'utf8', timeout: 20000 },
      );
      expect(result.error).toBeUndefined();
      if (result.status !== 0) throw new Error(`Node fixture install failed: ${result.stdout}\n${result.stderr}`);
      run(runtimePath(prefix, packageName));
    });
  }
}

function check(node: string, mode: string) {
  const child = spawnSync(node, ['-e', hook + probe, mode], { encoding: 'utf8', timeout: 10000 });
  expect(child.error).toBeUndefined();
  if (child.status !== 0) throw new Error(`Native probe failed: ${child.stdout}\n${child.stderr}`);
  const info = JSON.parse(child.stdout.trim()) as { version: string; hasReadLines: boolean; hasDispose: boolean };
  const warnings = child.stderr.split(/\r?\n/).filter((line) => line.includes('[canc] fs.FileHandle missing members'));
  return { info, warnings };
}

describe('owned native runtime fixture cleanup', () => {
  const prefix = 'owned-fixture-prefix';
  const probeError = new Error('probe failed');
  const cleanupError = Object.assign(new Error('cleanup failed'), { code: 'ENOTEMPTY' });

  it('retries transient recursive removal failures and stops on success', async () => {
    const remove = jest
      .fn(async () => {})
      .mockRejectedValueOnce(cleanupError)
      .mockRejectedValueOnce(cleanupError);
    const wait = jest.fn(async () => {});
    await removeOwnedPrefix(prefix, remove, wait);
    expect(remove).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledWith(prefix, { recursive: true, force: true, maxRetries: 0 });
    expect(wait.mock.calls).toEqual([[100], [200]]);
  });

  it('bounds retries for persistent removal failures', async () => {
    const remove = jest.fn(async () => {
      throw cleanupError;
    });
    const wait = jest.fn(async () => {});
    await expect(removeOwnedPrefix(prefix, remove, wait)).rejects.toBe(cleanupError);
    expect(remove).toHaveBeenCalledTimes(6);
    expect(wait.mock.calls).toEqual([[100], [200], [300], [400], [500]]);
  });

  it('does not retry unrelated failures', async () => {
    const error = Object.assign(new Error('invalid argument'), { code: 'EINVAL' });
    const remove = jest.fn(async () => {
      throw error;
    });
    const wait = jest.fn(async () => {});
    await expect(removeOwnedPrefix(prefix, remove, wait)).rejects.toBe(error);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('surfaces a persistent cleanup failure', async () => {
    const remove = jest.fn(async () => {
      throw cleanupError;
    });
    await expect(withOwnedPrefix(prefix, () => {}, remove)).rejects.toBe(cleanupError);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('preserves the original probe failure after successful cleanup', async () => {
    const remove = jest.fn(async () => {});
    try {
      await withOwnedPrefix(
        prefix,
        () => {
          throw probeError;
        },
        remove,
      );
      throw new Error('expected probe failure');
    } catch (error) {
      expect(error).toBe(probeError);
    }
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('retains both errors when the probe and cleanup fail', async () => {
    const remove = jest.fn(async () => {
      throw cleanupError;
    });
    try {
      await withOwnedPrefix(
        prefix,
        () => {
          throw probeError;
        },
        remove,
      );
      throw new Error('expected both failures');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([probeError, cleanupError]);
    }
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('native FileHandle member diagnostics', () => {
  it('does not warn on the actual oldest supported Node release', async () => {
    await withNode180((node) => {
      const { info, warnings } = check(node, 'normal');
      expect(info).toEqual({ version: 'v18.0.0', hasReadLines: false, hasDispose: false });
      expect(warnings).toEqual([]);
    });
  }, 40000);

  it('does not warn on a pristine current host', () => {
    const { info, warnings } = check(process.execPath, 'normal');
    expect(info.version).toBe(process.version);
    expect(warnings).toEqual([]);
  }, 15000);

  it('warns once when two handles share a damaged native prototype', () => {
    const { info, warnings } = check(process.execPath, 'broken');
    expect(info.version).toBe(process.version);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('readFile');
    if (info.hasReadLines) expect(warnings[0]).toContain('readLines');
  }, 15000);
});
