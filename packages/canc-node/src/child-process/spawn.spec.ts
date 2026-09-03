import { ChildProcess, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { CancelError, isCancelError } from '@cancjs/promise';

import { isProcessExitError, isProcessSpawnError } from '../errors/classes';
import { fork, spawn } from './spawn';

const forever = 'setTimeout(() => {}, 60000)';

// a real process crash cannot be observed from inside the runner (it intercepts uncaught
// exceptions for its own reporting), so this runs a fresh, unrelated node process instead, the same
// technique `canc-unhandled-rejection`'s spec support uses: a require hook transpiles `.ts` on the
// fly and resolves `@cancjs/promise` to its source, then the snippet runs with `-e`.
const promiseSrc = resolve(__dirname, '../../../canc-promise/src/index.ts');
const spawnSrc = resolve(__dirname, './spawn.ts');

const childHook = `
  const ts = require(${JSON.stringify(require.resolve('typescript'))});
  const Module = require('module');
  const fs = require('fs');

  Module._extensions['.ts'] = function (mod, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const out = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        esModuleInterop: true,
        downlevelIteration: true,
        useDefineForClassFields: false,
      },
      fileName: filename,
    });
    mod._compile(out.outputText, filename);
  };

  const origRequire = Module.prototype.require;
  Module.prototype.require = function (request) {
    if (request === '@cancjs/promise') {
      return origRequire.call(this, ${JSON.stringify(promiseSrc)});
    }
    return origRequire.call(this, request);
  };
`;

function runChildScript(code: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, ['-e', `${childHook}\n${code}`], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' };
}

type TTrackedChild = ChildProcess & { promise: Promise<unknown> };

describe('spawn and fork', () => {
  const children = new Set<TTrackedChild>();

  function track<T extends TTrackedChild>(child: T): T {
    children.add(child);
    return child;
  }

  afterEach(() => {
    for (const child of children) {
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        // reaping a child rejects a promise the test may have taken but not awaited
        child.promise.catch(() => undefined);
        child.kill('SIGKILL');
      }
    }
    children.clear();
  });

  describe('spawn', () => {
    it('returns the child process node returns', () => {
      const child = track(spawn(process.execPath, ['-e', 'process.exit(0)']));

      expect(child).toBeInstanceOf(ChildProcess);
      expect(child.stdout).toBeInstanceOf(Readable);
      expect(typeof child.kill).toBe('function');
      expect(typeof child.pid).toBe('number');
    });

    it('creates the promise only when it is asked for, and only once', () => {
      const child = track(spawn(process.execPath, ['-e', 'process.exit(0)']));

      expect(Object.keys(child)).not.toContain('promise');
      expect(Object.prototype.propertyIsEnumerable.call(child, 'promise')).toBe(false);
      expect(child.promise).toBe(child.promise);
    });

    it('resolves with the exit code and signal on a clean exit', async () => {
      const clean = track(spawn(process.execPath, ['-e', 'process.exit(0)']));

      await expect(clean.promise).resolves.toEqual({ exitCode: 0, signal: null });
    });

    it('rejects a non-zero exit with a ProcessExitError carrying the exit code', async () => {
      const failed = track(spawn(process.execPath, ['-e', 'process.exit(3)']));

      let caught: unknown;
      try {
        await failed.promise;
      } catch (err) {
        caught = err;
      }

      expect(isProcessExitError(caught)).toBe(true);
      expect((caught as { exitCode?: number | null }).exitCode).toBe(3);
      expect((caught as { signal?: string | null }).signal).toBeNull();
    });

    it('rejects a missing binary with a spawn error', async () => {
      const child = track(spawn('does_not_exist_binary_xyz_12345'));
      const promise = child.promise;

      let caught: unknown;
      try {
        await promise;
      } catch (err) {
        caught = err;
      }

      expect(isProcessSpawnError(caught)).toBe(true);
      expect((caught as { code?: string }).code).toBe('ENOENT');
    });

    it('rejects from a promise taken after the spawn error already fired', async () => {
      const child = track(spawn('does_not_exist_binary_xyz_67890'));
      await once(child, 'error');

      let caught: unknown;
      try {
        await child.promise;
      } catch (err) {
        caught = err;
      }

      expect(isProcessSpawnError(caught)).toBe(true);
      expect((caught as { code?: string }).code).toBe('ENOENT');
    });

    it('crashes a callback-only caller on a missing binary exactly as plain spawn does', () => {
      // real crash comparison, each in its own fresh process: plain node spawn against ours, same
      // binary, same absence of any listener or `.promise` access
      const plain = runChildScript(`
        require('child_process').spawn('does_not_exist_binary_xyz_11111');
      `);

      const ours = runChildScript(`
        const { spawn } = require(${JSON.stringify(spawnSrc)});
        spawn('does_not_exist_binary_xyz_11111');
      `);

      expect(plain.status).not.toBe(0);
      expect(ours.status).not.toBe(0);
      expect(ours.stderr).toContain('ENOENT');
      expect(ours.stderr).toContain('Error');
    }, 20000);

    it('lets a caller who listens for error see it once, with nothing re-raised', async () => {
      const child = track(spawn('does_not_exist_binary_xyz_33333'));
      let calls = 0;
      child.on('error', () => {
        calls++;
      });

      const rethrown: unknown[] = [];
      const onUncaught = (err: unknown) => rethrown.push(err);
      process.on('uncaughtException', onUncaught);

      try {
        await once(child, 'error');
        // give the recorder's would-be re-raise a turn of the event loop to happen, if it were going to
        await new Promise((resolve) => setImmediate(resolve));

        expect(calls).toBe(1);
        expect(rethrown).toEqual([]);
      } finally {
        process.off('uncaughtException', onUncaught);
      }
    });

    it('leaves stdout pipeable', async () => {
      const child = track(spawn(process.execPath, ['-e', "process.stdout.write('piped')"]));
      const sink = new PassThrough();
      const chunks: Buffer[] = [];
      sink.on('data', (chunk: Buffer) => chunks.push(chunk));

      child.stdout?.pipe(sink);
      await child.promise;

      expect(Buffer.concat(chunks).toString()).toBe('piped');
    });

    it('leaves stdout iterable, and leaves the child running when the loop breaks', async () => {
      const child = track(
        spawn(process.execPath, ['-e', `setInterval(() => process.stdout.write('tick\\n'), 10); ${forever}`]),
      );

      const chunks: string[] = [];
      for await (const chunk of child.stdout!) {
        chunks.push(String(chunk));
        break;
      }

      expect(chunks.length).toBe(1);
      expect(child.stdout?.destroyed).toBe(true);
      expect(child.exitCode).toBe(null);
    });

    it('forwards the timeout option to node, and rejects the signal kill it causes', async () => {
      const child = track(spawn(process.execPath, ['-e', forever], { timeout: 100 }));

      let caught: unknown;
      try {
        await child.promise;
      } catch (err) {
        caught = err;
      }

      expect(isProcessExitError(caught)).toBe(true);
      expect((caught as { exitCode?: number | null }).exitCode).toBeNull();
      expect((caught as { signal?: string | null }).signal).toBe('SIGTERM');
    });

    it('resolves the cancel only after the child exited', async () => {
      const child = track(spawn(process.execPath, ['-e', forever]));
      const promise = child.promise;
      const order: string[] = [];

      child.on('exit', () => order.push('exit'));
      await once(child, 'spawn');

      await promise.cancel();
      order.push('cancel');

      expect(order).toEqual(['exit', 'cancel']);
      expect(child.killed).toBe(true);
      await expect(promise).rejects.toThrow(CancelError);
    });

    it("lets an aborted caller signal reach the caller as node's AbortError", async () => {
      const controller = new AbortController();
      const child = track(spawn(process.execPath, ['-e', forever], { signal: controller.signal }));
      const promise = child.promise;

      await once(child, 'spawn');
      controller.abort();

      let caught: unknown;
      try {
        await promise;
      } catch (err) {
        caught = err;
      }

      expect((caught as Error).name).toBe('AbortError');
      expect(isCancelError(caught)).toBe(false);
    });

    it('settles a promise taken after the process already ended', async () => {
      const child = track(spawn(process.execPath, ['-e', 'process.exit(5)']));

      await new Promise((resolve) => child.on('close', resolve));

      let caught: unknown;
      try {
        await child.promise;
      } catch (err) {
        caught = err;
      }

      expect(isProcessExitError(caught)).toBe(true);
      expect((caught as { exitCode?: number | null }).exitCode).toBe(5);
    });
  });

  describe('fork', () => {
    let dir: string;
    let script: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'canc-fork-'));
      script = join(dir, 'child.js');
    });

    afterEach(() => {
      rmSync(dir, { force: true, recursive: true });
    });

    it('resolves with the exit code of the forked module', async () => {
      writeFileSync(script, 'process.exit(0);');
      const child = track(fork(script, { stdio: 'ignore' }));

      await expect(child.promise).resolves.toEqual({ exitCode: 0, signal: null });
    });

    it('keeps the IPC channel node sets up', async () => {
      writeFileSync(script, "process.on('message', (m) => { if (m === 'ping') process.send('pong'); });");
      const child = track(fork(script, { stdio: 'ignore' }));

      const reply = new Promise((resolve) => child.on('message', resolve));
      child.send('ping');

      await expect(reply).resolves.toBe('pong');
      expect(child.connected).toBe(true);

      await child.promise.cancel();
    });
  });
});
