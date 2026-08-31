import { ChildProcess, spawn } from 'node:child_process';
import { platform } from 'node:os';

import { killLadder } from './kill';

describe('killLadder', () => {
  const isWindows = platform() === 'win32';
  const children = new Set<ChildProcess>();

  afterEach(() => {
    for (const child of children) {
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
    }
    children.clear();
  });

  function spawnChild(code: string, detached = false): ChildProcess {
    const child = spawn(process.execPath, ['-e', code], { detached });
    children.add(child);
    return child;
  }

  const posixIt = isWindows ? it.skip : it;
  const windowsIt = isWindows ? it : it.skip;

  posixIt(
    'SIGTERM first: a child that traps SIGTERM and exits cleanly is never sent SIGKILL (skipped on Windows because POSIX signals are simulated as hard kills)',
    async () => {
      const child = spawnChild(`
      process.on('SIGTERM', () => process.exit(0));
      setTimeout(() => {}, 10000);
    `);

      // Wait for process to actually start
      await new Promise((r) => setTimeout(r, 200));

      const p = killLadder(child, { gracePeriod: 2000 });
      await p;

      // A process exiting cleanly on SIGTERM has exitCode 0
      expect(child.exitCode).toBe(0);
      expect(child.signalCode).toBeNull();
    },
  );

  posixIt(
    'Escalation: a child that ignores SIGTERM is killed after gracePeriod (skipped on Windows because SIGTERM terminates immediately)',
    async () => {
      const child = spawnChild(`
      process.on('SIGTERM', () => {});
      setTimeout(() => {}, 10000);
    `);

      await new Promise((r) => setTimeout(r, 200));

      const start = Date.now();
      const p = killLadder(child, { gracePeriod: 500 });
      await p;
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(400); // Allow some timing variance
      expect(child.signalCode).toBe('SIGKILL');
    },
  );

  it('Killing an already-exited child is a no-op that does not reject', async () => {
    const child = spawnChild('process.exit(0)');

    await new Promise<void>((resolve) => {
      child.on('exit', () => resolve());
    });

    await expect(killLadder(child)).resolves.toBeUndefined();
  });

  posixIt(
    'killTree: true with detached: true kills a grandchild (skipped on Windows because group kills are POSIX-only)',
    async () => {
      const child = spawnChild(
        `
      const { spawn } = require('child_process');
      const g = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 10000)']);
      console.log(g.pid);
      setTimeout(()=>{}, 10000);
    `,
        true,
      ); // detached on POSIX

      let grandchildPid = 0;
      child.stdout?.on('data', (d) => {
        grandchildPid = parseInt(d.toString().trim(), 10);
      });

      await new Promise((r) => setTimeout(r, 500));

      expect(grandchildPid).toBeGreaterThan(0);

      await killLadder(child, { killTree: true, gracePeriod: 500 });

      // Verify grandchild is dead
      expect(() => process.kill(grandchildPid, 0)).toThrow();
    },
  );

  windowsIt(
    'killTree: true on Windows invokes taskkill /pid <pid> /t /f and kills a grandchild (Windows only, POSIX group kill covered separately)',
    async () => {
      const child = spawnChild(`
      const { spawn } = require('child_process');
      const g = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 10000)']);
      console.log(g.pid);
      setTimeout(()=>{}, 10000);
    `);

      let grandchildPid = 0;
      child.stdout?.on('data', (d) => {
        // strip a forced-color TERM's escape codes around the printed pid before parsing
        const match = /\d+/.exec(d.toString());
        if (match) grandchildPid = parseInt(match[0], 10);
      });

      // Poll instead of a fixed sleep: startup time is unpredictable under parallel CI load
      const deadline = Date.now() + 15000;
      while (grandchildPid <= 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }

      expect(grandchildPid).toBeGreaterThan(0);

      // killTree: true on Windows takes the immediate taskkill /t /f branch, not escalation
      await killLadder(child, { killTree: true, gracePeriod: 500 });

      // Verify the whole tree, not just the direct child, is gone
      expect(() => process.kill(grandchildPid, 0)).toThrow();
    },
    20000,
  );

  it('await cancel() resolves within a bounded time even when the child never exits', async () => {
    const child = spawnChild(`
      process.on('SIGTERM', () => {});
      process.on('SIGKILL', () => {}); // Can't ignore SIGKILL, but we'll mock child.kill below
      setTimeout(() => {}, 10000);
    `);

    // Mock kill to do nothing so it never exits
    child.kill = () => false;

    const start = Date.now();
    await killLadder(child, { gracePeriod: 100 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(6000); // 100 + 5000 hard timeout
  });
});
