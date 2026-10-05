import { Worker as NodeWorker, WorkerOptions } from 'node:worker_threads';

import { CancelablePromise } from '@cancjs/promise';

import { ProcessExitError } from '../errors/classes';
import { terminateAndWaitForExit } from './promise';

/** The message a task worker receives when a graceful cancel asks it to stop. */
export const STOP_MESSAGE = '@cancjs/node:stop';

const DEFAULT_GRACE_PERIOD = 5000;

export type TTerminateMode = 'graceful' | 'immediate';

export interface IRunTaskOptions extends Omit<WorkerOptions, 'workerData'> {
  /** How long a graceful cancel waits for the worker to exit on its own. Defaults to 5000 ms. */
  gracePeriod?: number;
  /**
   * How a canceled task stops its worker. `graceful` posts the stop message first and terminates
   * only if the grace period runs out; `immediate` terminates straight away.
   */
  terminate?: TTerminateMode;
}

// the graceful ladder survives here, where the drop-in child process layer deliberately has none:
// node ships no promise form of Worker, so this is a new API rather than a mirror of one and sets
// its own contract, and terminate leaves a thread no finally, no flush and no unload hook
function stopWorker(worker: NodeWorker, mode: TTerminateMode, gracePeriod: number, exited: boolean): Promise<void> {
  if (exited) {
    return Promise.resolve();
  }

  if (mode === 'immediate') {
    return terminateAndWaitForExit(worker);
  }

  // nothing in this teardown is cancelable, so a vanilla promise is the right primitive
  return new Promise<void>((settle) => {
    const onExit = (): void => {
      clearTimeout(timer);
      settle();
    };

    const timer = setTimeout(() => {
      worker.removeListener('exit', onExit);
      void terminateAndWaitForExit(worker).then(settle);
    }, gracePeriod);

    // the thread being waited on already keeps the loop alive, so this timer must not add a handle
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    worker.once('exit', onExit);

    try {
      worker.postMessage(STOP_MESSAGE);
    } catch {
      // a worker whose port is already gone is in the state the cancel asked for
    }
  });
}

/**
 * Runs a script in a worker thread and resolves the first message that worker posts back.
 *
 * The worker gets `workerData` the way `new Worker(script, { workerData })` delivers it, and reports
 * its result with `parentPort.postMessage(result)`. A worker that ends without posting one rejects
 * with `ProcessExitError` carrying the exit code.
 *
 * Canceling posts `STOP_MESSAGE` to the worker and gives it `gracePeriod` milliseconds to exit on
 * its own before the thread is terminated. A worker that does not read its messages never sees that,
 * so pass `{ terminate: 'immediate' }` for one that cannot cooperate.
 *
 * @param script Module path, URL, or source code when `eval` is set.
 * @param workerData Value cloned into the worker.
 * @param options Node's worker options, plus `gracePeriod` and `terminate`.
 */
export function runTask<TResult = unknown>(
  script: string | URL,
  workerData?: unknown,
  options?: IRunTaskOptions,
): CancelablePromise<TResult> {
  const { gracePeriod = DEFAULT_GRACE_PERIOD, terminate = 'graceful', ...workerOptions } = options ?? {};

  return new CancelablePromise<TResult>((resolve, reject, { handleCancel }) => {
    const worker = new NodeWorker(script, { ...workerOptions, workerData });
    let exited = false;
    let hasResult = false;

    // registered before anything can settle, so a cancel racing the thread start still stops it
    handleCancel(() => stopWorker(worker, terminate, gracePeriod, exited));

    worker.once('message', (result: TResult) => {
      hasResult = true;
      resolve(result);
    });

    worker.on('error', reject);

    worker.once('exit', (code: number) => {
      exited = true;
      if (hasResult) {
        return;
      }
      reject(
        new ProcessExitError(`Worker exited with code ${code} before posting a result`, {
          exitCode: code,
          command: String(script),
        }),
      );
    });
  });
}
