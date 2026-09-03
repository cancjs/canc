import { ChildProcess } from 'node:child_process';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';

import { CancelError, isCancelError } from '@cancjs/promise';

import { isProcessExitError, isProcessSpawnError } from '../errors/classes';
import { exec, execFile } from './exec';

const nodeBin = `"${process.execPath}"`;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type TTrackedChild = ChildProcess & { promise: Promise<unknown> };

describe('exec and execFile', () => {
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

  describe('exec', () => {
    it('returns the child process node returns', () => {
      const child = track(exec(`${nodeBin} -e "process.stdout.write('hi')"`));

      expect(child).toBeInstanceOf(ChildProcess);
      expect(child.stdout).toBeInstanceOf(Readable);
      expect(typeof child.kill).toBe('function');
    });

    it('calls the callback as node does, and creates no promise on that path', async () => {
      const rejections: unknown[] = [];
      const onRejection = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onRejection);

      try {
        const callbackArgs = await new Promise<[unknown, string, string]>((resolve) => {
          track(
            exec(
              `${nodeBin} -e "process.stdout.write('out'); process.stderr.write('err'); process.exit(2)"`,
              (error, stdout, stderr) => {
                resolve([error, stdout, stderr]);
              },
            ),
          );
        });

        const [error, stdout, stderr] = callbackArgs;
        expect((error as { code?: number }).code).toBe(2);
        expect(stdout).toBe('out');
        expect(stderr).toBe('err');

        await delay(100);
        expect(rejections).toEqual([]);
      } finally {
        process.off('unhandledRejection', onRejection);
      }
    });

    it('keeps the promise property off enumeration', () => {
      const child = track(exec(`${nodeBin} -e "process.stdout.write('hi')"`));

      expect(Object.keys(child)).not.toContain('promise');
      expect(Object.prototype.propertyIsEnumerable.call(child, 'promise')).toBe(false);
    });

    it('returns the same promise on every access', () => {
      const child = track(exec(`${nodeBin} -e "process.stdout.write('hi')"`));

      expect(child.promise).toBe(child.promise);
    });

    it('resolves with stdout and stderr', async () => {
      const child = track(exec(`${nodeBin} -e "process.stdout.write('out'); process.stderr.write('err')"`));

      await expect(child.promise).resolves.toEqual({ stdout: 'out', stderr: 'err' });
    });

    it("rejects with node's own decorated error on a non-zero exit", async () => {
      const child = track(exec(`${nodeBin} -e "process.exit(42)"`));

      let caught: unknown;
      try {
        await child.promise;
      } catch (err) {
        caught = err;
      }

      expect((caught as { code?: number }).code).toBe(42);
      expect(isProcessExitError(caught)).toBe(false);
    });

    it('forwards the timeout option to node', async () => {
      const child = track(exec(`${nodeBin} -e "setTimeout(() => {}, 60000)"`, { timeout: 100 }));

      let caught: unknown;
      try {
        await child.promise;
      } catch (err) {
        caught = err;
      }

      expect(isProcessExitError(caught)).toBe(true);
      expect((caught as { signal?: string }).signal).toBe('SIGTERM');
    });

    it('cancels by killing the child, and resolves the cancel only after it exited', async () => {
      const child = track(exec(`${nodeBin} -e "setTimeout(() => {}, 60000)"`));
      const promise = child.promise;

      let exited = false;
      child.on('exit', () => {
        exited = true;
      });

      await delay(100);
      await promise.cancel();

      expect(exited).toBe(true);
      expect(child.killed).toBe(true);
      await expect(promise).rejects.toThrow(CancelError);
    });

    it("lets an aborted caller signal reach the caller as node's AbortError", async () => {
      const controller = new AbortController();
      const child = track(exec(`${nodeBin} -e "setTimeout(() => {}, 60000)"`, { signal: controller.signal }));
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
      const child = track(exec(`${nodeBin} -e "process.stdout.write('late')"`));

      await new Promise((resolve) => child.on('close', resolve));

      await expect(child.promise).resolves.toEqual({ stdout: 'late', stderr: '' });
    });

    it('is promisifiable into a cancelable promise carrying the child', async () => {
      const execAsync = promisify(exec);

      const promise = execAsync(`${nodeBin} -e "process.stdout.write('promisified')"`);
      track(promise.child);

      expect(typeof promise.cancel).toBe('function');
      expect(promise.child).toBeInstanceOf(ChildProcess);
      await expect(promise).resolves.toEqual({ stdout: 'promisified', stderr: '' });

      const slow = execAsync(`${nodeBin} -e "setTimeout(() => {}, 60000)"`);
      track(slow.child);
      await delay(100);
      await slow.cancel();
      await expect(slow).rejects.toThrow(CancelError);
    });
  });

  describe('execFile', () => {
    it('resolves with stdout and exposes the child process', async () => {
      const child = track(execFile(process.execPath, ['-e', "process.stdout.write('file-hi')"]));

      expect(child).toBeInstanceOf(ChildProcess);
      await expect(child.promise).resolves.toEqual({ stdout: 'file-hi', stderr: '' });
    });

    it('rejects a missing binary with a spawn error', async () => {
      const child = track(execFile('non_existent_binary_xyz_12345'));

      let caught: unknown;
      try {
        await child.promise;
      } catch (err) {
        caught = err;
      }

      expect(isProcessSpawnError(caught)).toBe(true);
      expect((caught as { code?: string }).code).toBe('ENOENT');
    });

    it('calls the callback with the arguments node passes', async () => {
      const stdout = await new Promise<string>((resolve, reject) => {
        track(
          execFile(process.execPath, ['-e', "process.stdout.write('cb')"], (error, out) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(out);
          }),
        );
      });

      expect(stdout).toBe('cb');
    });

    it('is promisifiable into a cancelable promise carrying the child', async () => {
      const execFileAsync = promisify(execFile);

      const promise = execFileAsync(process.execPath, ['-e', "process.stdout.write('pf')"]);
      track(promise.child);

      expect(typeof promise.cancel).toBe('function');
      await expect(promise).resolves.toEqual({ stdout: 'pf', stderr: '' });
    });
  });
});
