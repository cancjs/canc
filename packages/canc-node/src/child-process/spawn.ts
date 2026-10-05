import { ChildProcess, fork as nodeFork, ForkOptions, spawn as nodeSpawn, SpawnOptions } from 'node:child_process';

import { CancelablePromise } from '@cancjs/promise';

import { ProcessExitError } from '../errors/classes';
import { mapChildProcessError } from './map-error';
import { createSink, defineProcessPromise, ISettlementSink, killAndWaitForExit } from './promise';

export interface IProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

type TProcessSettlement =
  { kind: 'close'; code: number | null; signal: NodeJS.Signals | null } | { kind: 'error'; error: Error };

/**
 * Records the process's terminal event (`close` or `error`) as soon as it happens, so a `promise`
 * accessed later still has an answer instead of attaching a listener to an event that already fired.
 * Listeners are attached eagerly, so `listenerCount` differs from plain node.
 *
 * The `error` case needs care node's `close` case does not: node throws an uncaught exception on an
 * `error` with no listener. This recorder is itself a listener, so it would silently swallow that
 * crash for every callback-only caller unless it checks whether it was the only one and, if so,
 * re-raises asynchronously to reproduce node's own behavior.
 */
function attachProcessRecorder(child: ChildProcess): ISettlementSink<TProcessSettlement> {
  const sink = createSink<TProcessSettlement>();

  child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
    sink.settle({ kind: 'close', code, signal });
  });

  const onError = (error: Error): void => {
    // remove self FIRST: node's `once()` wrapper does the same before invoking its callback, and
    // skipping that step here would make listenerCount below count this handler itself, turning
    // "is anyone else watching" into "did anyone register after me"
    child.removeListener('error', onError);
    sink.settle({ kind: 'error', error });

    if (child.listenerCount('error') === 0) {
      setImmediate(() => {
        throw error;
      });
    }
  };

  child.on('error', onError);

  return sink;
}

export interface IProcessChildProcess extends ChildProcess {
  /**
   * A cancelable promise of how the process ended, created on first access and reused after that.
   * Canceling it sends `killSignal` and waits for the child to exit, and rejects with
   * `CancelError` rather than `ProcessExitError` for a kill this call initiated.
   */
  readonly promise: CancelablePromise<IProcessResult>;
}

// node's close event sets exactly one of code and signal; a clean exit is the only case that resolves
function settleProcessResult(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  command: string,
  resolve: (value: IProcessResult) => void,
  reject: (reason: unknown) => void,
): void {
  if (exitCode === 0 && signal === null) {
    resolve({ exitCode, signal });
    return;
  }

  const message =
    signal !== null ? `Process was terminated by signal ${signal}` : `Process exited with code ${exitCode}`;

  reject(new ProcessExitError(message, { command, exitCode, signal }));
}

function createProcessPromise(
  child: ChildProcess,
  sink: ISettlementSink<TProcessSettlement>,
  command: string,
  killSignal?: NodeJS.Signals | number,
): CancelablePromise<IProcessResult> {
  return new CancelablePromise<IProcessResult>((resolve, reject, ctx) => {
    ctx.handleCancel(() => killAndWaitForExit(child, killSignal));

    // presence marker, not a handler: the recorder's crash-on-unhandled check only sees real
    // listeners, so a caller who reached for the promise needs one on record even though the
    // actual settlement travels through the sink below. Harmless once the process has already
    // settled, since `error` cannot fire a second time.
    child.once('error', () => undefined);

    // the sink, not a raw read of `child.exitCode`/`signalCode`, is what answers a promise taken
    // late: on this platform a failed spawn sets `exitCode` to a negative errno before `close`
    // even runs, so reading those fields directly would misreport a spawn failure as a closed
    // process. The recorder is attached synchronously right after the process is created, before
    // node can emit either event, so the sink already has (or will have) the right answer either way.
    sink.subscribe((settlement) => {
      if (settlement.kind === 'error') {
        reject(mapChildProcessError(settlement.error, command));
        return;
      }
      settleProcessResult(settlement.code, settlement.signal, command, resolve, reject);
    });
  });
}

/**
 * Spawns a new process, exactly as `child_process.spawn` does.
 *
 * The return value is node's own `ChildProcess` with a `promise` property added. The promise
 * resolves `{ exitCode: 0, signal: null }` on a clean exit and rejects `ProcessExitError`
 * otherwise, carrying whichever of `exitCode` and `signal` node reported.
 *
 * @param command The command to run.
 * @param args Arguments passed to the command.
 * @param options Node's options for `spawn`, forwarded untouched.
 * @returns The child process, carrying a lazily created cancelable promise.
 */
export function spawn(command: string, options?: SpawnOptions): IProcessChildProcess;
export function spawn(command: string, args?: readonly string[], options?: SpawnOptions): IProcessChildProcess;
export function spawn(
  command: string,
  argsOrOptions?: readonly string[] | SpawnOptions,
  maybeOptions?: SpawnOptions,
): IProcessChildProcess {
  const args = Array.isArray(argsOrOptions) ? argsOrOptions : undefined;
  const options = (args ? maybeOptions : (argsOrOptions as SpawnOptions | undefined)) ?? {};

  const child = nodeSpawn(command, args ?? [], options);
  const sink = attachProcessRecorder(child);
  defineProcessPromise(child, () => createProcessPromise(child, sink, command, options.killSignal));

  return child as IProcessChildProcess;
}

/**
 * Forks a new node process running the given module, exactly as `child_process.fork` does.
 *
 * @param modulePath The module to run in the child.
 * @param args Arguments passed to the module.
 * @param options Node's options for `fork`, forwarded untouched.
 * @returns The child process, carrying a lazily created cancelable promise.
 */
export function fork(modulePath: string, options?: ForkOptions): IProcessChildProcess;
export function fork(modulePath: string, args?: readonly string[], options?: ForkOptions): IProcessChildProcess;
export function fork(
  modulePath: string,
  argsOrOptions?: readonly string[] | ForkOptions,
  maybeOptions?: ForkOptions,
): IProcessChildProcess {
  const args = Array.isArray(argsOrOptions) ? argsOrOptions : undefined;
  const options = (args ? maybeOptions : (argsOrOptions as ForkOptions | undefined)) ?? {};

  const child = nodeFork(modulePath, args ?? [], options);
  const sink = attachProcessRecorder(child);
  defineProcessPromise(child, () => createProcessPromise(child, sink, modulePath, options.killSignal));

  return child as IProcessChildProcess;
}
