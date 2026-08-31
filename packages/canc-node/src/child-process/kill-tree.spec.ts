import { ChildProcess, spawn } from 'node:child_process';
import { platform } from 'node:os';

import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { killTree } from './kill-tree';

describe('killTree', () => {
  const isWindows = platform() === 'win32';
  const children = new Set<ChildProcess>();

  afterEach(() => {
    children.forEach((child) => {
      try {
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          if (isWindows) {
            import('node:child_process').then((cp) => cp.exec(`taskkill /pid ${child.pid} /t /f`));
          } else {
            process.kill(-child.pid, 'SIGKILL');
            child.kill('SIGKILL');
          }
        }
      } catch {
        // ignore
      }
    });
    children.clear();
  });

  function spawnChild(code: string, detached = false): ChildProcess {
    const child = spawn(process.execPath, ['-e', code], { detached });
    children.add(child);
    return child;
  }

  it('returns a CancelablePromise instance', async () => {
    const child = spawnChild('process.exit(0)');
    const p = killTree(child);
    expect(p).toBeInstanceOf(CancelablePromise);
    await p;
  });

  it('resolves when the tree is gone, rejects nothing when it was already gone', async () => {
    const child = spawnChild('process.exit(0)');

    await new Promise<void>((resolve) => {
      child.on('exit', () => resolve());
    });

    await expect(killTree(child)).resolves.toBeUndefined();
  });

  const posixIt = isWindows ? it.skip : it;
  const windowsIt = isWindows ? it : it.skip;

  posixIt(
    'kills a grandchild on POSIX with detached group (skipped on Windows because process group signals are POSIX-only)',
    async () => {
      const child = spawnChild(
        `
      const { spawn } = require('child_process');
      const g = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 10000)']);
      console.log(g.pid);
      setTimeout(()=>{}, 10000);
    `,
        true,
      );

      let grandchildPid = 0;
      child.stdout?.on('data', (d) => {
        grandchildPid = parseInt(d.toString().trim(), 10);
      });

      await new Promise((r) => setTimeout(r, 500));

      expect(grandchildPid).toBeGreaterThan(0);

      await killTree(child, { gracePeriod: 500 });

      expect(() => process.kill(grandchildPid, 0)).toThrow();
    },
  );

  windowsIt(
    'calling killTree again on an already-exited process is a no-op success on Windows, the observable side of the taskkill ERROR_NOT_FOUND swallow',
    async () => {
      const child = spawnChild('setTimeout(() => {}, 10000)');

      // First call does the real taskkill /t /f and waits for actual exit
      await killTree(child, { gracePeriod: 500 });
      expect(child.exitCode).not.toBeNull();

      // Second call targets an already-exited pid; must not reject
      await expect(killTree(child, { gracePeriod: 500 })).resolves.toBeUndefined();
    },
  );

  it('rejects with CancelError when the killTree promise is canceled', async () => {
    const child = spawnChild('setTimeout(() => {}, 10000)');

    // Mock child.kill and delay exit to test cancelation
    child.kill = () => false;

    const p = killTree(child, { gracePeriod: 5000 });
    p.cancel();

    let caught: unknown;
    try {
      await p;
    } catch (e) {
      caught = e;
    }
    expect(isCancelError(caught)).toBe(true);
  });
});
