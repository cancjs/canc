import { dirname } from 'node:path';

import { lstat, rename, rm } from '@cancjs/node/fs';
import { lstatSync, renameSync, rmSync } from '@cancjs/node/fs/sync';
import { CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IToolboxDeps, retryFactory, TPromiseCtor } from '../../../_toolbox';
import type { Unlisted } from '../../../_util';
import { EEXIST, isCrossDeviceError, isErrno, isNotFoundError, isTooManyFilesError } from '../errors/errno';
import { copyTree, copyTreeSync } from './copy';
import { ensureDir, ensureDirSync } from './ensure';
import { checkPaths, checkPathsSync, IAbortSignalLike, throwIfAborted } from './utils';

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
function statOptionsWithSignal(signal: IAbortSignalLike) {
  return { bigint: false as const, signal };
}

interface ICancelableKind extends IPromiseKind {
  promise: CancelablePromise<this['value'], Unlisted>;
  options: object;
}

const deps: IToolboxDeps<ICancelableKind> = {
  Impl: CancelablePromise as unknown as TPromiseCtor,
  cancelable: true,
};

const retry = retryFactory(deps);

const isBusy = isErrno('EBUSY');
const isNotPermitted = isErrno('EPERM');
const isDenied = isErrno('EACCES');

export interface IMoveOptions {
  /**
   * Replace an existing destination file or directory. When `false`, an existing destination
   * rejects with `EEXIST`, as in fs-extra.
   *
   * @default false
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

// read per call so a platform forced in a test is honored
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Windows reports these while another handle still holds the file, and they clear on their own.
 * EPERM and EACCES count only on win32, where antivirus and indexers hold files briefly; elsewhere
 * they are real permission failures.
 */
function isTransient(err: unknown): boolean {
  return isBusy(err) || isTooManyFilesError(err) || (isWindows() && (isNotPermitted(err) || isDenied(err)));
}

/**
 * Renames with a bounded retry (roughly 0.6s in total) for transient lock errors.
 */
export function renameWithRetry(src: string, dest: string): CancelablePromise<void, Unlisted> {
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
    { retries: 10, initialDelay: 10, factor: 1.5, maxDelay: 100 },
  );

  return attempts.then((result) => {
    if (isPermanentFailure(result)) {
      return CancelablePromise.reject<void>(result.permanent);
    }
    return undefined;
  });
}

async function moveAcrossDevice(
  src: string,
  dest: string,
  options: IMoveOptions | undefined,
  signal: IAbortSignalLike,
  active: IActiveCall,
): Promise<void> {
  throwIfAborted(signal);
  await copyTree(src, dest, { overwrite: options?.overwrite ?? false }, signal, active);
  throwIfAborted(signal);
  await (active.current = rm(src, { recursive: true, force: true }));
}

/**
 * Moves a file or directory, with cross-device fallback using copy and delete.
 *
 * @param src - Source path to move.
 * @param dest - Destination path.
 * @param options - Options for the move operation.
 */
export function move(src: string, dest: string, options?: IMoveOptions): CancelablePromise<void, Unlisted> {
  return new CancelablePromise((resolve, reject, { getSignal, handleCancel }) => {
    const signal = getSignal();
    const active: IActiveCall = { current: null };
    handleCancel((reason) => {
      active.current?.cancel(reason);
    });

    const checkDest = checkPaths(src, dest, 'move', signal).then(({ isChangingCase }) =>
      options?.overwrite !== true && !isChangingCase ?
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
      : undefined,
    );

    const p = checkDest
      .then(() => {
        throwIfAborted(signal);
        return (active.current = ensureDir(dirname(dest)));
      })
      .then(() => {
        throwIfAborted(signal);
        return (active.current = renameWithRetry(src, dest));
      })
      .catch((err: unknown) => {
        throwIfAborted(signal);
        if (isCrossDeviceError(err)) {
          return moveAcrossDevice(src, dest, options, signal, active);
        }
        throw err;
      });

    resolve(p);
  });
}

/**
 * Moves a file or directory synchronously, with cross-device fallback using copy and delete.
 *
 * Does not retry on transient EPERM, EACCES or EBUSY errors.
 *
 * @param src - Source path to move.
 * @param dest - Destination path.
 * @param options - Options for the move operation.
 */
export function moveSync(src: string, dest: string, options?: IMoveOptions): void {
  const { isChangingCase } = checkPathsSync(src, dest, 'move');
  if (options?.overwrite !== true && !isChangingCase) {
    let destExists = false;
    try {
      lstatSync(dest);
      destExists = true;
    } catch (err: unknown) {
      if (!isNotFoundError(err)) {
        throw err;
      }
    }
    if (destExists) {
      const err: EEXIST = Object.assign(new Error(`dest already exists: ${dest}`), { code: 'EEXIST' as const });
      throw err;
    }
  }

  ensureDirSync(dirname(dest));

  try {
    renameSync(src, dest);
  } catch (err: unknown) {
    if (isCrossDeviceError(err)) {
      copyTreeSync(src, dest, { overwrite: options?.overwrite ?? false });
      rmSync(src, { recursive: true, force: true });
      return;
    }
    throw err;
  }
}
