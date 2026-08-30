import { ChildProcess, fork as nodeFork, ForkOptions, spawn as nodeSpawn, SpawnOptions } from 'node:child_process';

import { CancelablePromise, CancelError } from '@cancjs/promise';

import { ProcessExitError, ProcessIpcError, ProcessSignalError, ProcessSpawnError } from '../errors/classes';
import { IKillLadderOptions, killLadder } from './kill';

export interface IProcessResult {
  stdout: string | Buffer;
  stderr: string | Buffer;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface ISpawnOptions extends Omit<SpawnOptions, 'killSignal'>, IKillLadderOptions {}
export interface IForkOptions extends Omit<ForkOptions, 'killSignal'>, IKillLadderOptions {}

function concatChunks(chunks: (string | Buffer)[]): string | Buffer {
  if (chunks.length === 0) return Buffer.alloc(0);
  if (typeof chunks[0] === 'string') {
    return chunks.join('');
  }
  return Buffer.concat(chunks as Buffer[]);
}

function processSpawnOrFork(
  isFork: boolean,
  commandOrModule: string,
  args: readonly string[],
  options: ISpawnOptions | IForkOptions,
): CancelablePromise<IProcessResult> & { child: ChildProcess } {
  if (('timeout' as keyof ISpawnOptions) in options) {
    throw new TypeError('timeout option is not supported. Use timeout() from @cancjs/toolbox instead.');
  }

  const { killSignal, gracePeriod, killTree, signal: abortSignal, ...nodeOpts } = options;
  let child!: ChildProcess;

  if (abortSignal?.aborted) {
    const promise = new CancelablePromise<IProcessResult>((resolve, reject) => {
      reject(new CancelError('Process spawn canceled (pre-aborted)'));
    });
    child = Object.create(null) as ChildProcess;
    const ret = promise as CancelablePromise<IProcessResult> & { child: ChildProcess };
    ret.child = child;
    return ret;
  }

  if (isFork) {
    child = nodeFork(commandOrModule, args, nodeOpts as ForkOptions);
  } else {
    child = nodeSpawn(commandOrModule, args, nodeOpts as SpawnOptions);
  }

  let resolve!: (val: IProcessResult | PromiseLike<IProcessResult>) => void;
  let reject!: (reason?: any) => void;

  const promise = new CancelablePromise<IProcessResult>((res, rej, onCancel) => {
    resolve = res;
    reject = rej;

    let isCanceled = false;
    let isSettled = false;
    let spawnError: Error | null = null;
    let ipcError: Error | null = null;

    const stdoutChunks: (string | Buffer)[] = [];
    const stderrChunks: (string | Buffer)[] = [];

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        if (!isCanceled) stdoutChunks.push(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (!isCanceled) stderrChunks.push(chunk);
      });
    }

    const abortListener = () => {
      if (!isSettled) promise.cancel();
    };
    if (abortSignal) abortSignal.addEventListener('abort', abortListener);

    function cleanup() {
      if (abortSignal) abortSignal.removeEventListener('abort', abortListener);
    }

    child.on('error', (err: Error) => {
      if (isSettled) return;

      if ((err as any).code === 'ERR_IPC_CHANNEL_CLOSED' || (err as any).code === 'ERR_IPC_DISCONNECTED') {
        ipcError = err;
        return;
      }

      spawnError = err;
      isSettled = true;
      cleanup();

      reject(
        new ProcessSpawnError(`Process could not be spawned: ${err.message}`, {
          code: (err as any).code,
          command: commandOrModule,
          cause: err,
        }),
      );
    });

    child.on('close', (code, sig) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();

      if (isCanceled) return;
      if (spawnError) return;

      if (isFork && ipcError) {
        reject(new ProcessIpcError(`Process IPC channel disconnected`, { cause: ipcError }));
        return;
      }

      if (sig !== null) {
        reject(
          new ProcessSignalError(`Process was terminated by a signal: ${sig}`, {
            signal: sig,
            command: commandOrModule,
          }),
        );
        return;
      }

      const stdout = concatChunks(stdoutChunks);
      const stderr = concatChunks(stderrChunks);

      if (code !== 0) {
        reject(
          new ProcessExitError(`Process exited with a non-zero exit code: ${code}`, {
            exitCode: code,
            signal: sig,
            command: commandOrModule,
            stdout,
            stderr,
          }),
        );
        return;
      }

      resolve({ stdout, stderr, exitCode: code, signal: sig });
    });

    onCancel.handleCancel(async () => {
      if (isSettled) return;
      isCanceled = true;
      isSettled = true;
      cleanup();

      if (isFork && child.connected) {
        try {
          child.disconnect();
        } catch {
          // ignore
        }
      }

      try {
        await killLadder(child, { killSignal, gracePeriod, killTree });
      } catch {
        // ignore
      }

      throw new CancelError('Process canceled');
    });
  });

  const ret = promise as CancelablePromise<IProcessResult> & { child: ChildProcess };
  ret.child = child;
  return ret;
}

export function spawn(
  command: string,
  argsOrOptions?: readonly string[] | ISpawnOptions,
  maybeOptions?: ISpawnOptions,
): CancelablePromise<IProcessResult> & { child: ChildProcess } {
  let args: readonly string[] = [];
  let options: ISpawnOptions = {};

  if (Array.isArray(argsOrOptions)) {
    args = argsOrOptions;
    if (maybeOptions) options = maybeOptions;
  } else if (argsOrOptions != null && typeof argsOrOptions === 'object') {
    options = argsOrOptions as ISpawnOptions;
  }

  return processSpawnOrFork(false, command, args, options);
}

export function fork(
  modulePath: string,
  argsOrOptions?: readonly string[] | IForkOptions,
  maybeOptions?: IForkOptions,
): CancelablePromise<IProcessResult> & { child: ChildProcess } {
  let args: readonly string[] = [];
  let options: IForkOptions = {};

  if (Array.isArray(argsOrOptions)) {
    args = argsOrOptions;
    if (maybeOptions) options = maybeOptions;
  } else if (argsOrOptions != null && typeof argsOrOptions === 'object') {
    options = argsOrOptions as IForkOptions;
  }

  return processSpawnOrFork(true, modulePath, args, options);
}
