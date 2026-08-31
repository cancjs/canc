import {
  ChildProcess,
  exec as nodeExec,
  execFile as nodeExecFile,
  ExecFileOptions,
  ExecOptions,
} from 'node:child_process';
import { promisify } from 'node:util';

import { CancelablePromise, ICancelablePromiseOptions } from '@cancjs/promise';

import { isObject } from '../../../_util/guards';
import { ProcessExitError, ProcessMaxBufferError, ProcessSignalError, ProcessSpawnError } from '../errors/classes';
import { killLadder } from './kill';

const promisifiedExec = promisify(nodeExec);
const promisifiedExecFile = promisify(nodeExecFile);

export interface IExecResult<T = string | Buffer> {
  stdout: T;
  stderr: T;
}

export interface IProcessResult<T = string | Buffer> {
  stdout: T;
  stderr: T;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}

export interface IExecOptions extends Omit<ExecOptions, 'signal'>, ICancelablePromiseOptions {
  /** Signal sent to initiate termination. Defaults to 'SIGTERM'. */
  killSignal?: NodeJS.Signals | number;
  /** Milliseconds to wait before escalating termination. Defaults to 5000 ms. */
  gracePeriod?: number;
  /** Whether to terminate the entire process tree. Defaults to false. */
  killTree?: boolean;
}

export interface IExecBufferOptions extends IExecOptions {
  encoding: 'buffer' | null;
}

export interface IExecStringOptions extends IExecOptions {
  encoding?: BufferEncoding;
}

export interface IExecFileOptions extends Omit<ExecFileOptions, 'signal'>, ICancelablePromiseOptions {
  /** Signal sent to initiate termination. Defaults to 'SIGTERM'. */
  killSignal?: NodeJS.Signals | number;
  /** Milliseconds to wait before escalating termination. Defaults to 5000 ms. */
  gracePeriod?: number;
  /** Whether to terminate the entire process tree. Defaults to false. */
  killTree?: boolean;
}

export interface IExecFileBufferOptions extends IExecFileOptions {
  encoding: 'buffer' | null;
}

export interface IExecFileStringOptions extends IExecFileOptions {
  encoding?: BufferEncoding;
}

function checkTimeoutOption(options?: { timeout?: number }): void {
  if (options && 'timeout' in options && options.timeout !== undefined) {
    throw new TypeError('The "timeout" option is not supported. Use timeout() from @cancjs/toolbox instead.');
  }
}

function combineSignals(userSignal: unknown, cancelSignal: unknown): unknown {
  if (!userSignal) {
    return cancelSignal;
  }
  if (!cancelSignal) {
    return userSignal;
  }

  const signals = (Array.isArray(userSignal) ? userSignal : [userSignal]) as Array<{
    aborted?: boolean;
    reason?: unknown;
    addEventListener?: (type: string, listener: () => void, opts?: { once?: boolean }) => void;
  }>;
  signals.push(
    cancelSignal as {
      aborted?: boolean;
      reason?: unknown;
      addEventListener?: (type: string, listener: () => void, opts?: { once?: boolean }) => void;
    },
  );

  if (
    typeof AbortSignal !== 'undefined' &&
    'any' in AbortSignal &&
    typeof (AbortSignal as { any?: unknown }).any === 'function'
  ) {
    return (AbortSignal as { any: (sigs: unknown[]) => unknown }).any(signals);
  }

  const combinedController = new AbortController();
  for (const s of signals) {
    if (s?.aborted) {
      combinedController.abort(s.reason);
      return combinedController.signal;
    }
  }

  const onAbort = (s: { reason?: unknown }) => combinedController.abort(s.reason);
  for (const s of signals) {
    if (s && typeof s.addEventListener === 'function') {
      s.addEventListener('abort', () => onAbort(s), { once: true });
    }
  }

  return combinedController.signal;
}

export function mapChildProcessError(err: unknown, command?: string): unknown {
  if (!isObject(err)) {
    return err;
  }

  const error = err as {
    name?: string;
    code?: string | number;
    exitCode?: number;
    signal?: string | null;
    killed?: boolean;
    cmd?: string;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    syscall?: string;
    message?: string;
  };

  const cmd = error.cmd ?? command;

  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || error.name === 'ProcessMaxBufferError') {
    return new ProcessMaxBufferError(error.message, { command: cmd, cause: err });
  }

  if (
    typeof error.code === 'string' &&
    (error.syscall?.startsWith('spawn') ||
      error.code === 'ENOENT' ||
      error.code === 'EACCES' ||
      error.code === 'EMFILE' ||
      error.code === 'ENOTDIR' ||
      error.code === 'E2BIG')
  ) {
    return new ProcessSpawnError(error.message, {
      code: error.code,
      command: cmd,
      cause: err,
    });
  }

  if (error.signal && !error.code) {
    return new ProcessSignalError(error.message, {
      signal: error.signal,
      command: cmd,
      cause: err,
    });
  }

  if (
    typeof error.code === 'number' ||
    (error.code !== undefined && error.code !== null && error.code !== 'ABORT_ERR')
  ) {
    const exitCode = typeof error.code === 'number' ? error.code : (error.exitCode ?? null);
    return new ProcessExitError(error.message, {
      exitCode,
      signal: error.signal ?? null,
      stdout: error.stdout,
      stderr: error.stderr,
      command: cmd,
      cause: err,
    });
  }

  return err;
}

/**
 * Spawns a shell then executes the command within that shell, returning a cancelable promise.
 *
 * @param command The command string to run.
 * @param options Configuration options for process execution and cancellation.
 * @returns A cancelable promise resolving with stdout and stderr, exposing the ChildProcess as `.child`.
 */
export function exec(
  command: string,
  options: IExecBufferOptions,
): CancelablePromise<IExecResult<Buffer>> & { child: ChildProcess };
export function exec(
  command: string,
  options?: IExecStringOptions,
): CancelablePromise<IExecResult<string>> & { child: ChildProcess };
export function exec(
  command: string,
  options?: IExecOptions,
): CancelablePromise<IExecResult<string | Buffer>> & { child: ChildProcess };
export function exec(
  command: string,
  options?: IExecOptions,
): CancelablePromise<IExecResult<string | Buffer>> & { child: ChildProcess } {
  checkTimeoutOption(options);

  let childProcess: ChildProcess | undefined;

  const promise = new CancelablePromise<IExecResult<string | Buffer>>((resolve, reject, ctx) => {
    const effectiveSignal = combineSignals(options?.signal, ctx.getSignal()) as AbortSignal | undefined;

    const optsWithSignal = {
      ...options,
      signal: effectiveSignal,
    };

    const nativePromise = promisifiedExec(command, optsWithSignal);
    childProcess = nativePromise.child;

    // Registered after the spawn because the child does not exist until node returns it, which is
    // safe only because the executor body is synchronous and no cancel can land in between
    ctx.handleCancel(() => {
      if (childProcess) {
        void killLadder(childProcess, {
          killSignal: options?.killSignal,
          gracePeriod: options?.gracePeriod,
          killTree: options?.killTree,
        });
      }
    });

    nativePromise.then(
      (res: unknown) => resolve(res as IExecResult<string | Buffer>),
      (err: unknown) => {
        reject(mapChildProcessError(err, command));
      },
    );
  }, options);

  const result = promise as CancelablePromise<IExecResult<string | Buffer>> & { child: ChildProcess };
  result.child = childProcess!;
  return result;
}

/**
 * Spawns an executable directly without a shell, returning a cancelable promise.
 *
 * @param file The path or name of the executable file.
 * @param args Arguments to pass to the executable.
 * @param options Configuration options for process execution and cancellation.
 * @returns A cancelable promise resolving with stdout and stderr, exposing the ChildProcess as `.child`.
 */
export function execFile(
  file: string,
  options: IExecFileBufferOptions,
): CancelablePromise<IExecResult<Buffer>> & { child: ChildProcess };
export function execFile(
  file: string,
  args: readonly string[],
  options: IExecFileBufferOptions,
): CancelablePromise<IExecResult<Buffer>> & { child: ChildProcess };
export function execFile(
  file: string,
  options?: IExecFileStringOptions,
): CancelablePromise<IExecResult<string>> & { child: ChildProcess };
export function execFile(
  file: string,
  args: readonly string[],
  options?: IExecFileStringOptions,
): CancelablePromise<IExecResult<string>> & { child: ChildProcess };
export function execFile(
  file: string,
  args?: readonly string[] | IExecFileOptions,
  options?: IExecFileOptions,
): CancelablePromise<IExecResult<string | Buffer>> & { child: ChildProcess };
export function execFile(
  file: string,
  argsOrOptions?: readonly string[] | IExecFileOptions,
  optionsOrUndefined?: IExecFileOptions,
): CancelablePromise<IExecResult<string | Buffer>> & { child: ChildProcess } {
  let args: readonly string[] | undefined;
  let options: IExecFileOptions | undefined;

  if (Array.isArray(argsOrOptions)) {
    args = argsOrOptions;
    options = optionsOrUndefined;
  } else if (argsOrOptions && typeof argsOrOptions === 'object') {
    args = undefined;
    options = argsOrOptions as IExecFileOptions;
  } else {
    args = undefined;
    options = optionsOrUndefined;
  }

  checkTimeoutOption(options);

  let childProcess: ChildProcess | undefined;
  const commandStr = args && args.length > 0 ? `${file} ${args.join(' ')}` : file;

  const promise = new CancelablePromise<IExecResult<string | Buffer>>((resolve, reject, ctx) => {
    const effectiveSignal = combineSignals(options?.signal, ctx.getSignal()) as AbortSignal | undefined;

    const optsWithSignal = {
      ...options,
      signal: effectiveSignal,
    };

    // Mirrors node's own overloads: the promisified execFile has no args-less call signature
    const nativePromise =
      args ? promisifiedExecFile(file, args, optsWithSignal) : (promisifiedExecFile as any)(file, optsWithSignal);
    childProcess = nativePromise.child;

    // Registered after the spawn because the child does not exist until node returns it, which is
    // safe only because the executor body is synchronous and no cancel can land in between
    ctx.handleCancel(() => {
      if (childProcess) {
        void killLadder(childProcess, {
          killSignal: options?.killSignal,
          gracePeriod: options?.gracePeriod,
          killTree: options?.killTree,
        });
      }
    });

    nativePromise.then(
      (res: unknown) => resolve(res as IExecResult<string | Buffer>),
      (err: unknown) => {
        reject(mapChildProcessError(err, commandStr));
      },
    );
  }, options);

  const result = promise as CancelablePromise<IExecResult<string | Buffer>> & { child: ChildProcess };
  result.child = childProcess!;
  return result;
}
