import { dirname } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IToolboxDeps, retryFactory, TPromiseCtor } from '../../../_toolbox';
import { EEXIST, isCrossDeviceError, isErrno, isNotFoundError, isTooManyFilesError } from '../errors/errno';
import { lstat, rename, rm } from '../fs';
import { copyTree } from './copy';
import { ensureDir } from './ensure';

/**
 * The call presently in flight, so a cancel reaches it directly instead of waiting for
 * the next checkpoint.
 * Single-slot register only safe because moveAcrossDevice is strictly sequential.
 * Needed because node accepts signal for lstat/stat only; rename, rm, ensureDir and
 * other calls have no signal, so canceling our inner promise is the only way to interrupt
 * them.
 */
interface IActiveCall {
  current: CancelablePromise<unknown> | null;
}

/**
 * `lstat` takes a signal from node 26.8; passing one is safe everywhere because
 * takeCallerSignal strips it from node's options bag before the call, so node never sees
 * an unknown key.
 * Without stripping, Deno would throw ERR_INVALID_ARG_TYPE.
 */
function statOptionsWithSignal(signal: AbortSignal) {
  return { bigint: false as const, signal };
}

interface ICancelableKind extends IPromiseKind {
  promise: CancelablePromise<this['value']>;
  options: object;
}

const deps: IToolboxDeps<ICancelableKind> = {
  Impl: CancelablePromise as unknown as TPromiseCtor,
  cancelable: true,
};

const retry = retryFactory(deps);

const isNotPermitted = isErrno('EPERM');
const isBusy = isErrno('EBUSY');

export interface IMoveOptions {
  /**
   * Overwrite existing destination file or directory.
   *
   * @default true
   */
  overwrite?: boolean;
}

/** Carries a permanent failure out of the retry loop, which retries anything that rejects. */
interface IPermanentFailure {
  readonly permanent: unknown;
}

function isPermanentFailure(value: unknown): value is IPermanentFailure {
  return typeof value === 'object' && value !== null && 'permanent' in value;
}

/** Windows reports these while another handle still holds the file, and they clear on their own. */
function isTransient(err: unknown): boolean {
  return isNotPermitted(err) || isBusy(err) || isTooManyFilesError(err);
}

function renameWithRetry(src: string, dest: string): CancelablePromise<void> {
  const attempts = retry(
    () =>
      rename(src, dest).then(
        () => undefined,
        (err: unknown) => {
          if (isTransient(err)) {
            throw err;
          }
          return { permanent: err };
        },
      ),
    { retries: 5, minTimeout: 10, factor: 1.5, maxTimeout: 500 },
  );

  return attempts.then((result) => {
    if (isPermanentFailure(result)) {
      return CancelablePromise.reject(result.permanent);
    }
    return undefined;
  });
}

async function moveAcrossDevice(
  src: string,
  dest: string,
  options: IMoveOptions | undefined,
  signal: AbortSignal,
  active: IActiveCall,
): Promise<void> {
  signal.throwIfAborted();
  await copyTree(src, dest, { overwrite: options?.overwrite ?? true }, signal, active);
  signal.throwIfAborted();
  await (active.current = rm(src, { recursive: true, force: true }));
}

/**
 * Moves a file or directory, with cross-device fallback using copy and delete.
 *
 * @param src - Source path to move.
 * @param dest - Destination path.
 * @param options - Options for the move operation.
 */
export function move(src: string, dest: string, options?: IMoveOptions): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { getSignal, handleCancel }) => {
    const signal = getSignal() as AbortSignal;
    const active: IActiveCall = { current: null };
    handleCancel((reason) => {
      active.current?.cancel(reason);
    });

    const checkDest =
      options?.overwrite === false ?
        (active.current = lstat(dest, statOptionsWithSignal(signal))).then(
          () => {
            const err: EEXIST = Object.assign(new Error(`dest already exists: ${dest}`), { code: 'EEXIST' as const });
            throw err;
          },
          (err: unknown) => {
            if (isNotFoundError(err)) {
              return undefined;
            }
            throw err;
          },
        )
      : CancelablePromise.resolve();

    const p = checkDest
      .then(() => {
        signal.throwIfAborted();
        return (active.current = ensureDir(dirname(dest)));
      })
      .then(() => {
        signal.throwIfAborted();
        return (active.current = renameWithRetry(src, dest));
      })
      .catch((err: unknown) => {
        signal.throwIfAborted();
        if (isCrossDeviceError(err)) {
          return moveAcrossDevice(src, dest, options, signal, active);
        }
        throw err;
      });

    resolve(p);
  });
}
