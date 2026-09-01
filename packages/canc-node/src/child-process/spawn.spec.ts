import { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { CancelError, isCancelError } from '@cancjs/promise';

import { isProcessSpawnError } from '../errors/classes';
import { fork, spawn } from './spawn';

const forever = 'setTimeout(() => {}, 60000)';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    it('resolves with the exit code and signal, including a non-zero exit', async () => {
      const clean = track(spawn(process.execPath, ['-e', 'process.exit(0)']));
      const failed = track(spawn(process.execPath, ['-e', 'process.exit(3)']));

      await expect(clean.promise).resolves.toEqual({ exitCode: 0, signal: null });
      await expect(failed.promise).resolves.toEqual({ exitCode: 3, signal: null });
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

    it('forwards the timeout option to node', async () => {
      const child = track(spawn(process.execPath, ['-e', forever], { timeout: 100 }));

      await expect(child.promise).resolves.toEqual({ exitCode: null, signal: 'SIGTERM' });
    });

    it('resolves the cancel only after the child exited', async () => {
      const child = track(spawn(process.execPath, ['-e', forever]));
      const promise = child.promise;
      const order: string[] = [];

      child.on('exit', () => order.push('exit'));
      await delay(100);

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

      await delay(100);
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

      await expect(child.promise).resolves.toEqual({ exitCode: 5, signal: null });
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
