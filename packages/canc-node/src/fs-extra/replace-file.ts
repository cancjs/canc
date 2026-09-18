import { basename, dirname, join } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { isErrno, isNotFoundError } from '../errors/errno';
import { chmod, chown, rename, stat, unlink, writeFile } from '../fs';
import { chmodSync, chownSync, renameSync, statSync, unlinkSync, writeFileSync } from '../fs/sync';

type TWriteFileParams = Parameters<typeof writeFile>;
type TWriteData = TWriteFileParams[1];

export type IReplaceFileOptions = TWriteFileParams[2];

type TWriteFileSyncParams = Parameters<typeof writeFileSync>;
type TWriteFileSyncData = TWriteFileSyncParams[1];

export type IReplaceFileSyncOptions = TWriteFileSyncParams[2];

const isNotPermitted = isErrno('EPERM');
const isNotSupported = isErrno('ENOSYS');
const isBusy = isErrno('EBUSY');

/** How chmod and chown fail where the file system does not carry the metadata. Not fatal. */
function isMetadataUnsupported(err: unknown): boolean {
  return isNotPermitted(err) || isNotSupported(err);
}

/** Retry unlink on transient Windows lock errors during cleanup. */
function unlinkWithRetry(path: string, attempts = 5): Promise<void> {
  return unlink(path).catch((err: unknown) => {
    if (attempts > 1 && (isNotPermitted(err) || isBusy(err))) {
      return new Promise<void>((resolve) => setTimeout(resolve, 10)).then(() => unlinkWithRetry(path, attempts - 1));
    }
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
 * - Does not support append mode.
 * - Does not call fsync, so guarantees hold against concurrent readers and not against a system crash.
 */
export function replaceFile(path: string, data: TWriteData, options?: IReplaceFileOptions): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const dir = dirname(path);
    const base = basename(path);
    const tempPath = join(
      dir,
      `.${base}.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    );

    let activePromise: CancelablePromise<unknown> | null = null;
    let isRenamed = false;

    // returned, not dropped: a returned thenable is awaited before the cancelation settles
    handleCancel((reason) => {
      activePromise?.cancel(reason);
      if (isRenamed) {
        return undefined;
      }

      return unlinkWithRetry(tempPath);
    });

    const writePromise = (activePromise = writeFile(tempPath, data, options));
    resolve(
      writePromise
        .then(() => {
          const statPromise = (activePromise = stat(path));
          return statPromise.then(
            (st) => {
              const chmodPromise = (activePromise = chmod(tempPath, st.mode));
              return chmodPromise
                .then(() => {
                  if (typeof st.uid === 'number' && typeof st.gid === 'number') {
                    const chownPromise = (activePromise = chown(tempPath, st.uid, st.gid));
                    return chownPromise.then(undefined, (err: unknown) => {
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
          const renamePromise = (activePromise = rename(tempPath, path));
          return renamePromise.then(() => {
            isRenamed = true;
          });
        })
        .then(undefined, (err: unknown) => {
          if (isRenamed) {
            throw err;
          }

          // chained so the rejection waits for the temp file to go, same as the cancel path
          return unlinkWithRetry(tempPath).then(() => {
            throw err;
          });
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
 * - Does not support append mode.
 * - Does not call fsync, so guarantees hold against concurrent readers and not against a system crash.
 *
 * @param path - Target file path to replace.
 * @param data - Content to write.
 * @param options - Write options.
 */
export function replaceFileSync(path: string, data: TWriteFileSyncData, options?: IReplaceFileSyncOptions): void {
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
