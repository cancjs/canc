import * as fs from 'node:fs';
import * as path from 'node:path';

import { CancelablePromise, CancelError } from '@cancjs/promise';

import { ProcessSignalError, ProcessSpawnError } from '../errors/classes';
import { fork, spawn } from './spawn';

describe('spawn and fork', () => {
  const children = new Set<any>();

  afterEach(() => {
    for (const child of children) {
      try {
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
    }
    children.clear();
  });

  function track(p: CancelablePromise<any> & { child: any }) {
    children.add(p.child);
    return p;
  }

  it('1. Resolves with stdout, stderr, exitCode and signal on a clean exit', async () => {
    const p = track(spawn(process.execPath, ['-e', 'console.log("out"); console.error("err")']));
    const res = await p;
    expect(res.exitCode).toBe(0);
    expect(res.signal).toBe(null);
    expect(res.stdout.toString().trim()).toBe('out');
    expect(res.stderr.toString().trim()).toBe('err');
  });

  it('2. Settles on close, not exit (yields complete output from slow stdio drain)', async () => {
    // Child exits immediately, but grandchild keeps stdout open for 50ms and writes to it
    const code = `
      const cp = require("child_process");
      cp.spawn(process.execPath, ["-e", "setTimeout(() => { console.log('delayed'); }, 50);"], {
        detached: true,
        stdio: ['ignore', 1, 2],
        windowsHide: true
      });
      process.exit(0);
    `;
    const p = track(spawn(process.execPath, ['-e', code]));

    let exited = false;
    p.child.on('exit', () => {
      exited = true;
    });

    const res = await p;
    expect(exited).toBe(true);
    expect(res.stdout.toString().trim()).toBe('delayed');
  });

  it('3. Cancel rejects CancelError, not ProcessSignalError (internal flag)', async () => {
    const p = track(spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)']));

    // Wait for it to actually start
    await new Promise((r) => setTimeout(r, 50));

    const pCancel = p.cancel();

    await expect(p).rejects.toThrow(CancelError);
    await pCancel;
  });

  it('4. An external SIGTERM rejects ProcessSignalError, not CancelError', async () => {
    const p = track(spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)']));

    await new Promise((r) => setTimeout(r, 50));

    // Send external signal
    p.child.kill('SIGTERM');

    await expect(p).rejects.toThrow(ProcessSignalError);
  });

  it('5. Spawn failure rejects ProcessSpawnError exactly once', async () => {
    let settles = 0;
    const p = track(spawn('does-not-exist-binary-xyz'));

    try {
      await p;
    } catch (e) {
      settles++;
      expect(e).toBeInstanceOf(ProcessSpawnError);
    }

    // Wait a bit to ensure it does not settle twice (e.g. from close event)
    await new Promise((r) => setTimeout(r, 20));
    expect(settles).toBe(1);
  });

  it('6. Writing to a killed child stdin does not produce an unhandled rejection', async () => {
    const p = track(
      spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    await p.cancel();

    // writing to stdin after kill
    expect(() => {
      p.child.stdin?.write('test\n');
    }).not.toThrow();

    // Give it a moment to ensure no unhandled promise rejection in the background
    await new Promise((r) => setTimeout(r, 50));
  });

  it('7. fork: IPC round trip works, and cancel disconnects the channel before killing', async () => {
    const scriptPath = path.join(__dirname, 'temp-fork-script.js');
    fs.writeFileSync(
      scriptPath,
      `
      process.on('message', (m) => {
        if (m === 'ping') process.send('pong');
      });
      setTimeout(() => {}, 60000);
    `,
    );

    try {
      const p = track(fork(scriptPath));

      await new Promise((r) => setTimeout(r, 50));

      const pongPromise = new Promise((resolve) => {
        p.child.on('message', resolve);
      });

      p.child.send('ping');
      const msg = await pongPromise;
      expect(msg).toBe('pong');

      await p.cancel();
      expect(p.child.connected).toBe(false);

      await expect(p).rejects.toThrow(CancelError);
    } finally {
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        /* ignore */
      }
    }
  });
});
