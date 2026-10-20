import { constants } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { chmod, chown, stat, unlink, writeFile } from '@cancjs/node/fs';
import { chmodSync, chownSync, renameSync, statSync, unlinkSync, writeFileSync } from '@cancjs/node/fs/sync';
import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';
import { isErrno, isNotFoundError } from '../errors/errno';
import { renameWithRetry } from './move';

type TWriteFileParams = Parameters<typeof writeFile>;
type TWriteData = TWriteFileParams[1];

export type IReplaceFileOptions = TWriteFileParams[2];

type TWriteFileSyncParams = Parameters<typeof writeFileSync>;
type TWriteFileSyncData = TWriteFileSyncParams[1];

export type IReplaceFileSyncOptions = TWriteFileSyncParams[2];

const isNotPermitted = isErrno('EPERM');
const isNotSupported = isErrno('ENOSYS');
const isBusy = isErrno('EBUSY');

// ~480ms budget, where the old 5 attempts at 10ms gave 40ms
// 40ms is routinely shorter than the Windows antivirus and indexer holds this retry exists for
const UNLINK_ATTEMPTS = 12;
const UNLINK_RETRY_MS = 40;

/** Append cannot be atomic through a temp file: the existing content would be dropped, so it is refused. */
function assertNoAppendFlag(options: unknown, name: string): void {
  const flag = typeof options === 'object' && options !== null ? (options as { flag?: unknown }).flag : undefined;
  const isAppend =
    typeof flag === 'string' ? flag.startsWith('a') : typeof flag === 'number' && (flag & constants.O_APPEND) !== 0;

  if (isAppend) {
    throw Object.assign(new TypeError(`${name} does not support the append flag "${String(flag)}"`), {
      code: 'ERR_INVALID_ARG_VALUE',
    });
  }
}

/** How chmod and chown fail where the file system does not carry the metadata. Not fatal. */
function isMetadataUnsupported(err: unknown): boolean {
  return isNotPermitted(err) || isNotSupported(err);
}

/**
 * Retry unlink on transient lock errors during cleanup.
 *
 * ENOENT is retried with the other transient errors, and only a final ENOENT counts as success.
 * Everything else that is not a known-transient errno is rethrown, because a swallowed failure
 * leaves a temp file while the promise settles clean and tells nobody.
 */
function unlinkWithRetry(path: string, attempts = UNLINK_ATTEMPTS): Promise<void> {
  return unlink(path).catch((err: unknown) => {
    const transient = isNotPermitted(err) || isBusy(err) || isNotFoundError(err);

    if (!transient) {
      throw err;
    }

    if (attempts <= 1) {
      // a final ENOENT means the file never appeared, which is the outcome this wants anyway
      if (isNotFoundError(err)) {
        return undefined;
      }

      throw err;
    }

    return new Promise<void>((resolve) => setTimeout(resolve, UNLINK_RETRY_MS)).then(() =>
      unlinkWithRetry(path, attempts - 1),
    );
  });
}

/**
 * Atomically replaces a file by writing to a temporary file beside the target and renaming it.
 *
 * Preserves the existing file permissions and ownership if it exists.
 * On cancellation, the temporary file is deleted and the target remains untouched.
 *
 * Limitations:
 * - Does not write through symlinks (replaces the symlink itself).
 * - Does not support special files (FIFOs, device nodes).
 * - Rejects the append flags (`a`, `a+`, and so on) with a `TypeError`, since an append cannot be atomic.
 * - Does not call fsync, so guarantees hold against concurrent readers and not against a system crash.
 */
export function replaceFile(
  path: string,
  data: TWriteData,
  options?: IReplaceFileOptions,
): CancelablePromise<void, Unlisted> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    assertNoAppendFlag(options, 'replaceFile');

    const dir = dirname(path);
    const base = basename(path);
    const tempPath = join(
      dir,
      `.${base}.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    );

    let isCanceled = false;
    let isRenamed = false;
    let isRenameStarted = false;

    // the write is not canceled: canceling the wrapper does not stop a write already handed to the
    // platform, so the temp file is removed only once that write settles, and the
    // cancelation waits for that, so a late write cannot outlive the cleanup
    const writePromise = writeFile(tempPath, data, options);
    const writeSettled = writePromise.then(
      () => undefined,
      () => undefined,
    );

    // returned, not dropped: a returned thenable is awaited before the cancelation settles
    handleCancel(() => {
      isCanceled = true;

      // a rename already started cannot be undone, so the chain owns whatever it leaves behind
      if (isRenameStarted) {
        return undefined;
      }

      return writeSettled.then(() => unlinkWithRetry(tempPath));
    });

    resolve(
      writePromise
        .then(() => {
          if (isCanceled) {
            throw new Error('replaceFile canceled before the rename');
          }

          return stat(path).then(
            (st) => {
              return chmod(tempPath, st.mode)
                .then(() => {
                  if (typeof st.uid === 'number' && typeof st.gid === 'number') {
                    return chown(tempPath, st.uid, st.gid).then(undefined, (err: unknown) => {
                      if (!isMetadataUnsupported(err)) {
                        throw err;
                      }
                    });
                  }
                  return undefined;
                })
                .then(undefined, (err: unknown) => {
                  if (!isMetadataUnsupported(err)) {
                    throw err;
                  }
                });
            },
            (err: unknown) => {
              if (isNotFoundError(err)) {
                return undefined;
              }
              throw err;
            },
          );
        })
        .then(() => {
          if (isCanceled) {
            throw new Error('replaceFile canceled before the rename');
          }

          isRenameStarted = true;
          return renameWithRetry(tempPath, path).then(() => {
            isRenamed = true;
          });
        })
        .then(undefined, (err: unknown) => {
          if (isRenamed) {
            throw err;
          }

          // no rename started: the handler removes the temp file once the write settles
          if (isCanceled && !isRenameStarted) {
            throw err;
          }

          // the write error wins over a failed cleanup, same as the sync twin
          return unlinkWithRetry(tempPath).then(
            () => {
              throw err;
            },
            () => {
              throw err;
            },
          );
        }),
    );
  });
}

/**
 * Synchronously and atomically replaces a file by writing to a temporary file beside the target and renaming it.
 *
 * Preserves the existing file permissions and ownership if it exists.
 *
 * Limitations:
 * - Does not write through symlinks (replaces the symlink itself).
 * - Does not support special files (FIFOs, device nodes).
 * - Rejects the append flags (`a`, `a+`, and so on) with a `TypeError`, since an append cannot be atomic.
 * - Does not call fsync, so guarantees hold against concurrent readers and not against a system crash.
 *
 * @param path - Target file path to replace.
 * @param data - Content to write.
 * @param options - Write options.
 */
export function replaceFileSync(path: string, data: TWriteFileSyncData, options?: IReplaceFileSyncOptions): void {
  assertNoAppendFlag(options, 'replaceFileSync');

  const dir = dirname(path);
  const base = basename(path);
  const tempPath = join(
    dir,
    `.${base}.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  );

  let isRenamed = false;
  try {
    writeFileSync(tempPath, data, options);
    try {
      const st = statSync(path);
      try {
        chmodSync(tempPath, st.mode);
      } catch (err: unknown) {
        if (!isMetadataUnsupported(err)) {
          throw err;
        }
      }
      if (typeof st.uid === 'number' && typeof st.gid === 'number') {
        try {
          chownSync(tempPath, st.uid, st.gid);
        } catch (err: unknown) {
          if (!isMetadataUnsupported(err)) {
            throw err;
          }
        }
      }
    } catch (err: unknown) {
      if (!isNotFoundError(err)) {
        throw err;
      }
    }
    renameSync(tempPath, path);
    isRenamed = true;
  } catch (err: unknown) {
    if (!isRenamed) {
      try {
        unlinkSync(tempPath);
      } catch {
        // swallow cleanup failure so original error surfaces
      }
    }
    throw err;
  }
}
