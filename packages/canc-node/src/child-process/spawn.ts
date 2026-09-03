import { ChildProcess, fork as nodeFork, ForkOptions, spawn as nodeSpawn, SpawnOptions } from 'node:child_process';

import { CancelablePromise } from '@cancjs/promise';

import { ProcessExitError } from '../errors/classes';
import { mapChildProcessError } from './map-error';
import { defineProcessPromise, killAndWaitForExit } from './promise';

export interface IProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
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
  command: string,
  killSignal?: NodeJS.Signals | number,
): CancelablePromise<IProcessResult> {
  return new CancelablePromise<IProcessResult>((resolve, reject, ctx) => {
    ctx.handleCancel(() => killAndWaitForExit(child, killSignal));

    // node tracks how the process ended, so a promise taken after the fact still has an answer
    if (child.exitCode !== null || child.signalCode !== null) {
      settleProcessResult(child.exitCode, child.signalCode, command, resolve, reject);
      return;
    }

    child.once('error', (err: Error) => {
      reject(mapChildProcessError(err, command));
    });

    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
      settleProcessResult(code, signal, command, resolve, reject);
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
  defineProcessPromise(child, () => createProcessPromise(child, command, options.killSignal));

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
  defineProcessPromise(child, () => createProcessPromise(child, modulePath, options.killSignal));

  return child as IProcessChildProcess;
}
