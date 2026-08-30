import { ChildProcess } from 'node:child_process';
import { platform } from 'node:os';

import { CancelError, isCancelError } from '@cancjs/promise';

import {
  isProcessExitError,
  isProcessMaxBufferError,
  isProcessSpawnError,
  ProcessExitError,
  ProcessMaxBufferError,
  ProcessSpawnError,
} from '../errors/classes';
import { exec, execFile } from './exec';

describe('exec and execFile', () => {
  const isWindows = platform() === 'win32';
  const trackedChildren = new Set<ChildProcess>();
  const nodeBin = `"${process.execPath}"`;

  afterEach(() => {
    for (const child of trackedChildren) {
      try {
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          if (isWindows) {
            import('node:child_process').then((cp) => cp.exec(`taskkill /pid ${child.pid} /t /f`));
          } else {
            child.kill('SIGKILL');
          }
        }
      } catch {
        // ignore
      }
    }
    trackedChildren.clear();
  });

  describe('exec', () => {
    it('resolves with stdout on clean success', async () => {
      const p = exec(`${nodeBin} -e "process.stdout.write('hi')"`);
      if (p.child) trackedChildren.add(p.child);

      const res = await p;
      expect(res.stdout).toBe('hi');
      expect(res.stderr).toBe('');
    });

    it('.child is present on the returned promise and is a ChildProcess', () => {
      const p = exec(`${nodeBin} -e "process.stdout.write('hi')"`);
      if (p.child) trackedChildren.add(p.child);

      expect(p.child).toBeDefined();
      expect(p.child).toBeInstanceOf(ChildProcess);
    });

    it('rejects ProcessExitError carrying exitCode, stdout and stderr on non-zero exit', async () => {
      const p = exec(`${nodeBin} -e "process.stdout.write('out'); process.stderr.write('err'); process.exit(42);"`);
      if (p.child) trackedChildren.add(p.child);

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ProcessExitError);
      expect(isProcessExitError(caught)).toBe(true);
      expect(isProcessSpawnError(caught)).toBe(false);

      const exitErr = caught as ProcessExitError;
      expect(exitErr.exitCode).toBe(42);
      expect(exitErr.stdout).toBe('out');
      expect(exitErr.stderr).toBe('err');
    });

    it('rejects ProcessMaxBufferError on maxBuffer overflow', async () => {
      const p = exec(`${nodeBin} -e "process.stdout.write('1234567890')"`, {
        maxBuffer: 5,
      });
      if (p.child) trackedChildren.add(p.child);

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ProcessMaxBufferError);
      expect(isProcessMaxBufferError(caught)).toBe(true);
      expect(isProcessExitError(caught)).toBe(false);
    });

    it('cancel kills the process, rejects CancelError, and child.killed is true', async () => {
      const p = exec(`${nodeBin} -e "setTimeout(()=>{}, 60000)"`);
      if (p.child) trackedChildren.add(p.child);

      await new Promise((r) => setTimeout(r, 100));

      const cancelPromise = p.cancel();
      await cancelPromise;

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(CancelError);
      expect(isCancelError(caught)).toBe(true);
      expect(p.child.killed).toBe(true);
    });

    it('throws a TypeError naming the toolbox helper when timeout is passed', () => {
      expect(() => exec(`${nodeBin} -v`, { timeout: 1000 } as any)).toThrow(TypeError);
      expect(() => exec(`${nodeBin} -v`, { timeout: 1000 } as any)).toThrow(
        /The "timeout" option is not supported\. Use timeout\(\) from @cancjs\/toolbox instead\./,
      );
    });
  });

  describe('execFile', () => {
    it('resolves with stdout and exposes .child on success', async () => {
      const p = execFile(process.execPath, ['-e', "process.stdout.write('file-hi')"]);
      if (p.child) trackedChildren.add(p.child);

      expect(p.child).toBeInstanceOf(ChildProcess);
      const res = await p;
      expect(res.stdout).toBe('file-hi');
    });

    it('rejects ProcessSpawnError on missing binary and is distinguished from ProcessExitError', async () => {
      const p = execFile('non_existent_binary_xyz_12345');
      if (p.child) trackedChildren.add(p.child);

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ProcessSpawnError);
      expect(isProcessSpawnError(caught)).toBe(true);
      expect(isProcessExitError(caught)).toBe(false);

      const spawnErr = caught as ProcessSpawnError;
      expect(spawnErr.code).toBe('ENOENT');
    });

    it('rejects ProcessExitError on non-zero exit', async () => {
      const p = execFile(process.execPath, [
        '-e',
        "process.stdout.write('out'); process.stderr.write('err'); process.exit(7);",
      ]);
      if (p.child) trackedChildren.add(p.child);

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ProcessExitError);
      expect(isProcessExitError(caught)).toBe(true);
      expect(isProcessSpawnError(caught)).toBe(false);

      const exitErr = caught as ProcessExitError;
      expect(exitErr.exitCode).toBe(7);
      expect(exitErr.stdout).toBe('out');
      expect(exitErr.stderr).toBe('err');
    });

    it('rejects ProcessMaxBufferError on maxBuffer overflow', async () => {
      const p = execFile(process.execPath, ['-e', "process.stdout.write('1234567890')"], { maxBuffer: 5 });
      if (p.child) trackedChildren.add(p.child);

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ProcessMaxBufferError);
      expect(isProcessMaxBufferError(caught)).toBe(true);
    });

    it('cancel kills the process and rejects CancelError', async () => {
      const p = execFile(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)']);
      if (p.child) trackedChildren.add(p.child);

      await new Promise((r) => setTimeout(r, 100));

      await p.cancel();

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }

      expect(isCancelError(caught)).toBe(true);
      expect(p.child.killed).toBe(true);
    });

    it('throws a TypeError naming the toolbox helper when timeout is passed', () => {
      expect(() => execFile(process.execPath, ['-v'], { timeout: 1000 } as any)).toThrow(TypeError);
      expect(() => execFile(process.execPath, ['-v'], { timeout: 1000 } as any)).toThrow(
        /The "timeout" option is not supported\. Use timeout\(\) from @cancjs\/toolbox instead\./,
      );
    });
  });
});
