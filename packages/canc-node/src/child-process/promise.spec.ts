import { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { killAndWaitForExit } from './promise';

interface IFakeStream {
  destroy: jest.Mock;
}

/** A child stand-in: a real emitter with the kill and stdio surface `killAndWaitForExit` touches. */
function fakeChild(): ChildProcess & { stdin: IFakeStream; stdout: IFakeStream; stderr: IFakeStream } {
  const child = new EventEmitter() as unknown as ChildProcess & {
    stdin: IFakeStream;
    stdout: IFakeStream;
    stderr: IFakeStream;
  };
  Object.assign(child, {
    exitCode: null,
    signalCode: null,
    kill: jest.fn(() => true),
    stdin: { destroy: jest.fn() },
    stdout: { destroy: jest.fn() },
    stderr: { destroy: jest.fn() },
  });
  return child;
}

describe('killAndWaitForExit', () => {
  it('destroys every stdio stream right after the kill', () => {
    const child = fakeChild();

    void killAndWaitForExit(child);

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(child.stdin.destroy).toHaveBeenCalledTimes(1);
    expect(child.stdout.destroy).toHaveBeenCalledTimes(1);
    expect(child.stderr.destroy).toHaveBeenCalledTimes(1);
  });

  it('resolves only on close, not on exit', async () => {
    const child = fakeChild();
    let settled = false;

    const done = killAndWaitForExit(child).then(() => {
      settled = true;
    });

    child.emit('exit', null, 'SIGTERM');
    await Promise.resolve();
    expect(settled).toBe(false);

    child.emit('close', null, 'SIGTERM');
    await done;
    expect(settled).toBe(true);
  });

  it('resolves at once for a child that already ended, without touching its streams', async () => {
    const child = fakeChild();
    Object.assign(child, { exitCode: 0 });

    await killAndWaitForExit(child);

    expect(child.kill).not.toHaveBeenCalled();
    expect(child.stdout.destroy).not.toHaveBeenCalled();
  });
});
