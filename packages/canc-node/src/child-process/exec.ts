import {
  ChildProcess,
  exec as nodeExec,
  ExecException,
  execFile as nodeExecFile,
  ExecFileException,
  ExecFileOptions,
  ExecFileOptionsWithBufferEncoding,
  ExecFileOptionsWithStringEncoding,
  ExecOptions,
  ExecOptionsWithBufferEncoding,
  ExecOptionsWithStringEncoding,
} from 'node:child_process';

import { CancelablePromise } from '@cancjs/promise';

import { mapChildProcessError } from './map-error';
import { defineProcessPromise, killAndWaitForExit } from './promise';

const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');

export interface IExecResult<T extends string | Buffer = string> {
  stdout: T;
  stderr: T;
}

export interface IExecChildProcess<T extends string | Buffer = string> extends ChildProcess {
  /**
   * A cancelable promise of the buffered result, created on first access and reused after that.
   * Canceling it sends `killSignal` and waits for the child to exit.
   */
  readonly promise: CancelablePromise<IExecResult<T>>;
}

export type TExecPromise<T extends string | Buffer = string> = CancelablePromise<IExecResult<T>> & {
  child: IExecChildProcess<T>;
};

type TExecOptions = ExecOptions | ExecOptionsWithStringEncoding | ExecOptionsWithBufferEncoding;
type TExecFileOptions = ExecFileOptions | ExecFileOptionsWithStringEncoding | ExecFileOptionsWithBufferEncoding;
type TExecCallback<T extends string | Buffer> = (error: ExecException | null, stdout: T, stderr: T) => void;
type TExecFileCallback<T extends string | Buffer> = (error: ExecFileException | null, stdout: T, stderr: T) => void;

// mirrors node's own callback overloads, which disagree on both the error type and the output type
type TAnyCallback = (error: any, stdout: any, stderr: any) => void;

interface ISettlement {
  error: ExecException | ExecFileException | null;
  stdout: string | Buffer;
  stderr: string | Buffer;
}

interface ISettlementSink {
  settle(settlement: ISettlement): void;
  subscribe(listener: (settlement: ISettlement) => void): void;
}

// node buffers the output into its own callback, so the result is held here until someone asks for
// the promise; a call that already finished still has a result to hand over
function createSink(): ISettlementSink {
  let settled: ISettlement | undefined;
  let listener: ((settlement: ISettlement) => void) | undefined;

  return {
    settle(settlement: ISettlement): void {
      settled = settlement;
      if (listener) {
        listener(settlement);
      }
    },
    subscribe(fn: (settlement: ISettlement) => void): void {
      if (settled) {
        fn(settled);
      } else {
        listener = fn;
      }
    },
  };
}

function createExecPromise(
  child: ChildProcess,
  sink: ISettlementSink,
  command: string,
  killSignal?: NodeJS.Signals | number,
): CancelablePromise<IExecResult<string | Buffer>> {
  return new CancelablePromise<IExecResult<string | Buffer>>((resolve, reject, ctx) => {
    ctx.handleCancel(() => killAndWaitForExit(child, killSignal));

    sink.subscribe((settlement) => {
      if (settlement.error) {
        reject(mapChildProcessError(settlement.error, command));
        return;
      }
      resolve({ stdout: settlement.stdout, stderr: settlement.stderr });
    });
  });
}

/**
 * Spawns a shell then runs the command within that shell, exactly as `child_process.exec` does.
 *
 * The return value is node's own `ChildProcess` with a `promise` property added, so the callback
 * form, the streams and every option keep working unchanged.
 *
 * @param command The command to run.
 * @param options Node's options for `exec`, forwarded untouched.
 * @param callback Node's callback, called with the buffered output.
 * @returns The child process, carrying a lazily created cancelable promise.
 */
export function exec(command: string, callback?: TExecCallback<string>): IExecChildProcess<string>;
export function exec(
  command: string,
  options: ExecOptionsWithBufferEncoding,
  callback?: TExecCallback<Buffer>,
): IExecChildProcess<Buffer>;
export function exec(
  command: string,
  options: ExecOptionsWithStringEncoding | ExecOptions,
  callback?: TExecCallback<string>,
): IExecChildProcess<string>;
export function exec(
  command: string,
  optionsOrCallback?: TExecOptions | TAnyCallback,
  maybeCallback?: TAnyCallback,
): IExecChildProcess<string | Buffer> {
  const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
  const sink = createSink();

  const child = nodeExec(command, options!, (error, stdout, stderr) => {
    sink.settle({ error, stdout, stderr });
    if (callback) {
      callback(error, stdout, stderr);
    }
  });

  defineProcessPromise(child, () => createExecPromise(child, sink, command, options?.killSignal));

  return child as IExecChildProcess<string | Buffer>;
}

/**
 * Runs an executable directly without a shell, exactly as `child_process.execFile` does.
 *
 * @param file The executable to run.
 * @param args Arguments passed to the executable.
 * @param options Node's options for `execFile`, forwarded untouched.
 * @param callback Node's callback, called with the buffered output.
 * @returns The child process, carrying a lazily created cancelable promise.
 */
export function execFile(file: string, callback?: TExecFileCallback<string>): IExecChildProcess<string>;
export function execFile(
  file: string,
  args: readonly string[] | undefined | null,
  callback?: TExecFileCallback<string>,
): IExecChildProcess<string>;
export function execFile(
  file: string,
  options: ExecFileOptionsWithBufferEncoding,
  callback?: TExecFileCallback<Buffer>,
): IExecChildProcess<Buffer>;
export function execFile(
  file: string,
  options: ExecFileOptionsWithStringEncoding | ExecFileOptions,
  callback?: TExecFileCallback<string>,
): IExecChildProcess<string>;
export function execFile(
  file: string,
  args: readonly string[] | undefined | null,
  options: ExecFileOptionsWithBufferEncoding,
  callback?: TExecFileCallback<Buffer>,
): IExecChildProcess<Buffer>;
export function execFile(
  file: string,
  args: readonly string[] | undefined | null,
  options: ExecFileOptionsWithStringEncoding | ExecFileOptions,
  callback?: TExecFileCallback<string>,
): IExecChildProcess<string>;
export function execFile(
  fileOrCommand: string,
  argsOrOptionsOrCallback?: readonly string[] | null | TExecFileOptions | TAnyCallback,
  optionsOrCallback?: TExecFileOptions | TAnyCallback,
  maybeCallback?: TAnyCallback,
): IExecChildProcess<string | Buffer> {
  let args: readonly string[] | undefined;
  let options: TExecFileOptions | undefined;
  let callback: TAnyCallback | undefined;

  if (Array.isArray(argsOrOptionsOrCallback)) {
    args = argsOrOptionsOrCallback;
  } else if (typeof argsOrOptionsOrCallback === 'function') {
    callback = argsOrOptionsOrCallback;
  } else if (argsOrOptionsOrCallback) {
    options = argsOrOptionsOrCallback as TExecFileOptions;
  }

  if (typeof optionsOrCallback === 'function') {
    callback = optionsOrCallback;
  } else if (optionsOrCallback) {
    options = optionsOrCallback;
  }

  if (maybeCallback) {
    callback = maybeCallback;
  }

  const sink = createSink();
  const command = args && args.length > 0 ? `${fileOrCommand} ${args.join(' ')}` : fileOrCommand;

  const child = nodeExecFile(fileOrCommand, args ?? [], options as ExecFileOptions, (error, stdout, stderr) => {
    sink.settle({ error, stdout, stderr });
    if (callback) {
      callback(error, stdout, stderr);
    }
  });

  defineProcessPromise(child, () => createExecPromise(child, sink, command, options?.killSignal));

  return child as IExecChildProcess<string | Buffer>;
}

// node's typings read the promisified form off this member, so promisify(exec) keeps its types
// eslint-disable-next-line @typescript-eslint/no-namespace -- declaration merging is the only way to attach it
export declare namespace exec {
  function __promisify__(command: string, options?: TExecOptions): TExecPromise<string | Buffer>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- declaration merging is the only way to attach it
export declare namespace execFile {
  function __promisify__(
    file: string,
    args?: readonly string[] | null,
    options?: TExecFileOptions,
  ): TExecPromise<string | Buffer>;
}

function execPromisified(command: string, options?: TExecOptions): TExecPromise<string | Buffer> {
  const child = exec(command, options as ExecOptions);
  const promise = child.promise as TExecPromise<string | Buffer>;
  promise.child = child;
  return promise;
}

function execFilePromisified(
  file: string,
  args?: readonly string[] | null,
  options?: TExecFileOptions,
): TExecPromise<string | Buffer> {
  const child = execFile(file, args, options as ExecFileOptions);
  const promise = child.promise as TExecPromise<string | Buffer>;
  promise.child = child;
  return promise;
}

// promisify(exec) then produces our cancelable promise instead of node's, matching the shape node's
// own promisified exec returns
Object.defineProperty(exec, PROMISIFY_CUSTOM, { configurable: true, value: execPromisified });
Object.defineProperty(execFile, PROMISIFY_CUSTOM, { configurable: true, value: execFilePromisified });
