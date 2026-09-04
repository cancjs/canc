import { Worker as NodeWorker, WorkerOptions } from 'node:worker_threads';

import { CancelablePromise } from '@cancjs/promise';

import { createSink, defineWorkerPromise, ISettlementSink, terminateAndWaitForExit } from './promise';

export interface IWorkerWithPromise extends NodeWorker {
  /**
   * A cancelable promise of the thread's exit code, created on first access and reused after that.
   * Canceling it terminates the thread and waits for it to stop.
   */
  readonly promise: CancelablePromise<number>;
}

export interface IWorkerConstructor {
  new (filename: string | URL, options?: WorkerOptions): IWorkerWithPromise;
  readonly prototype: NodeWorker;
}

type TWorkerSettlement = { kind: 'exit'; code: number } | { kind: 'error'; error: Error };

/**
 * Records the thread's terminal event (`exit` or `error`) as soon as it happens, so a `promise`
 * accessed later still has an answer instead of attaching a listener to an event that already fired.
 *
 * The `error` case needs care the `exit` case does not: node throws an uncaught exception on an
 * `error` with no listener. This recorder is itself a listener, so it would silently swallow that
 * crash for every callback-only caller unless it checks whether it was the only one and, if so,
 * re-raises asynchronously to reproduce node's own behavior.
 */
function attachWorkerRecorder(worker: NodeWorker): ISettlementSink<TWorkerSettlement> {
  const sink = createSink<TWorkerSettlement>();

  worker.once('exit', (code: number) => {
    sink.settle({ kind: 'exit', code });
  });

  const onError = (error: Error): void => {
    // remove self FIRST: node's `once()` wrapper does the same before invoking its callback, and
    // skipping that step here would make listenerCount below count this handler itself, turning
    // "is anyone else watching" into "did anyone register after me"
    worker.removeListener('error', onError);
    sink.settle({ kind: 'error', error });

    if (worker.listenerCount('error') === 0) {
      setImmediate(() => {
        throw error;
      });
    }
  };

  worker.on('error', onError);

  return sink;
}

function createWorkerPromise(worker: NodeWorker, sink: ISettlementSink<TWorkerSettlement>): CancelablePromise<number> {
  return new CancelablePromise<number>((resolve, reject, ctx) => {
    // terminate is the only stop node has for a thread it did not hand us a protocol for; the
    // graceful ladder belongs to `runTask`, which owns both ends of the conversation
    ctx.handleCancel(() => terminateAndWaitForExit(worker));

    // presence marker, not a handler: the recorder's crash-on-unhandled check only sees real
    // listeners, so a caller who reached for the promise needs one on record even though the
    // actual settlement travels through the sink below
    worker.once('error', () => undefined);

    sink.subscribe((settlement) => {
      if (settlement.kind === 'error') {
        reject(settlement.error);
        return;
      }
      resolve(settlement.code);
    });
  });
}

// node's Worker is an ES class and this package emits ES5, where `extends` becomes a
// `_super.call(this)` an ES class rejects, so the real worker is constructed and returned instead
function CancelableWorker(filename: string | URL, options?: WorkerOptions): IWorkerWithPromise {
  const worker = new NodeWorker(filename, options);
  const sink = attachWorkerRecorder(worker);
  defineWorkerPromise(worker, () => createWorkerPromise(worker, sink));

  return worker as IWorkerWithPromise;
}

CancelableWorker.prototype = NodeWorker.prototype;

/**
 * Starts a worker thread, exactly as `worker_threads.Worker` does.
 *
 * The return value is node's own `Worker` with a `promise` property added. The promise resolves the
 * exit code, rejects whatever node reports through the `error` event, and terminates the thread when
 * canceled.
 */
export const Worker = CancelableWorker as unknown as IWorkerConstructor;
