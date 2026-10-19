import { isCancelError, isTimeoutError, TimeoutError } from '@cancjs/promise';

import { isProcessExitError, ProcessExitError } from '../errors/classes';
import { reviveWorkerError } from './error-revive';
import { runTask } from './run-task';
import { Worker } from './worker';

// what node hands over for a thrown error: a plain Error carrying the name, own props and cause
function serialized(name: string, message: string, extra: Record<string, unknown> = {}): Error {
  const error = new Error(message, { cause: new Error('inner') });
  error.name = name;
  Object.assign(error, extra);
  return error;
}

const throwingTask = (name: string, extra: string) => `
  const error = new Error('task stopped', { cause: new Error('inner') });
  error.name = ${JSON.stringify(name)};
  ${extra}
  throw error;
`;

describe('@cancjs/node worker-threads error revival', () => {
  it('rebuilds a CancelError by name, keeping message, cause and stack', () => {
    const original = serialized('CancelError', 'stopped');
    const revived = reviveWorkerError(original);

    expect(isCancelError(revived)).toBe(true);
    expect((revived as Error).message).toBe('stopped');
    expect((revived as Error).cause).toEqual(new Error('inner'));
  });

  it('rebuilds a TimeoutError by name', () => {
    expect(isTimeoutError(reviveWorkerError(serialized('TimeoutError', 'slow')))).toBe(true);
  });

  it('keeps own properties such as exitCode on a rebuilt ProcessExitError', () => {
    const revived = reviveWorkerError(serialized('ProcessExitError', 'exited', { exitCode: 3 }));

    expect(isProcessExitError(revived)).toBe(true);
    expect((revived as { exitCode?: number }).exitCode).toBe(3);
  });

  it('leaves a plain Error with an unknown name unchanged', () => {
    const original = serialized('Boom', 'plain');
    expect(reviveWorkerError(original)).toBe(original);
  });

  it('leaves a caller-defined subclass unchanged even when its name matches', () => {
    class LocalTimeout extends Error {}
    const original = new LocalTimeout('mine');
    original.name = 'TimeoutError';

    expect(reviveWorkerError(original)).toBe(original);
  });

  it('leaves a non-error value unchanged', () => {
    expect(reviveWorkerError('stopped')).toBe('stopped');
  });

  it('runTask rejects a CancelError thrown in the worker with the canc brand', async () => {
    const promise = runTask(throwingTask('CancelError', "error.code = 'E_STOP';"), undefined, { eval: true });

    const reason = await promise.catch((err: unknown) => err);
    expect(isCancelError(reason)).toBe(true);
    expect((reason as { code?: string }).code).toBe('E_STOP');
    expect((reason as Error).message).toBe('task stopped');
  });

  it('runTask rejects a TimeoutError thrown in the worker with the canc brand', async () => {
    const reason = await runTask(throwingTask('TimeoutError', ''), undefined, { eval: true }).catch(
      (err: unknown) => err,
    );
    expect(isTimeoutError(reason)).toBe(true);
    expect(reason).toBeInstanceOf(TimeoutError);
  });

  it('runTask leaves a plain worker error with an unknown name unchanged', async () => {
    const reason = await runTask(throwingTask('Boom', ''), undefined, { eval: true }).catch((err: unknown) => err);
    expect(isCancelError(reason)).toBe(false);
    expect((reason as Error).name).toBe('Boom');
  });

  it('Worker promise rejects a revived CancelError from the thread error event', async () => {
    const worker = new Worker(`const error = new Error('stopped'); error.name = 'CancelError'; throw error;`, {
      eval: true,
    });
    worker.once('error', () => undefined);

    const reason = await worker.promise.catch((err: unknown) => err);
    expect(isCancelError(reason)).toBe(true);
  });

  it('keeps a ProcessExitError class reference usable as an instanceof check after revival', () => {
    const revived = reviveWorkerError(serialized('ProcessExitError', 'x'));
    expect(revived).toBeInstanceOf(ProcessExitError);
  });
});
