import { basename, dirname, join } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { isErrno, isNotFoundError } from '../errors/errno';
import { chmod, chown, rename, stat, unlink, writeFile } from '../fs';

type TWriteFileParams = Parameters<typeof writeFile>;
type TWriteData = TWriteFileParams[1];

export type IReplaceFileOptions = TWriteFileParams[2];

const isNotPermitted = isErrno('EPERM');
const isNotSupported = isErrno('ENOSYS');

/** How chmod and chown fail where the file system does not carry the metadata. Not fatal. */
function isMetadataUnsupported(err: unknown): boolean {
  return isNotPermitted(err) || isNotSupported(err);
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

    handleCancel((reason) => {
      activePromise?.cancel(reason);
      if (!isRenamed) {
        unlink(tempPath).catch(() => {});
      }
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
          if (!isRenamed) {
            unlink(tempPath).catch(() => {});
          }
          throw err;
        }),
    );
  });
}
