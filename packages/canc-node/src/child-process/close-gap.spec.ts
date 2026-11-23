import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CancelablePromise, CancelError } from '@cancjs/promise';

import { exec, execFile } from './exec';
import { killAndWaitForExit } from './promise';
import { fork, spawn } from './spawn';

const code = "process.stdout.write('ok')";

describe('child cancellation close barrier', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canc-close-gap-'));
  const script = join(dir, 'child.js');
  writeFileSync(script, code);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    ['spawn', () => spawn(process.execPath, ['-e', code])],
    ['fork', () => fork(script, { silent: true })],
    ['exec', () => exec('echo ok')],
    ['execFile', () => execFile(process.execPath, ['-e', code])],
  ] as const)('%s waits through real exit-to-close gap', async (name, create) => {
    const child = create();
    const kill = jest.spyOn(child, 'kill');
    const chunks: string[] = [];
    let closes = 0;
    const closed = new Promise<void>((resolve) =>
      child.once('close', () => {
        closes++;
        resolve();
      }),
    );
    const result = child.promise as CancelablePromise<unknown, unknown>;
    const outcome = result.then(undefined, (error: unknown) => error);
    try {
      const observation = await new Promise<{ before: number; after: number }>((resolve) => {
        child.once('exit', () => {
          const before = closes;
          void Promise.resolve(result.cancel()).then(() => resolve({ before, after: closes }));
          child.stdout?.on('data', (chunk: string | Buffer) => chunks.push(String(chunk)));
        });
      });
      await closed;
      expect(observation.before).toBe(0);
      expect(observation.after).toBe(1);
      expect(closes).toBe(1);
      expect(kill).not.toHaveBeenCalled();
      if (name === 'spawn') expect(chunks.join('').trim()).toBe('ok');
      const settled = await outcome;
      if (name === 'spawn' || name === 'fork') expect(settled).toBeInstanceOf(CancelError);
    } finally {
      kill.mockRestore();
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed;
    }
  });

  it('records close before first promise access', async () => {
    const child = spawn(process.execPath, ['-e', code]);
    child.stdout?.resume();
    await once(child, 'close');
    await expect(child.promise).resolves.toEqual({ exitCode: 0, signal: null });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const finished = await Promise.race([
        killAndWaitForExit(child).then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 200);
        }),
      ]);
      expect(finished).toBe(true);
    } finally {
      if (timer) clearTimeout(timer);
    }
  });

  it('waits for close after a pre-exit cancel', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)']);
    const result = child.promise;
    const outcome = Promise.resolve(result).catch((error: unknown) => error);
    let closed = false;
    const done = new Promise<void>((resolve) =>
      child.once('close', () => {
        closed = true;
        resolve();
      }),
    );
    try {
      await once(child, 'spawn');
      await result.cancel();
      expect(closed).toBe(true);
      expect(await outcome).toBeInstanceOf(CancelError);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await done;
    }
  });
});
