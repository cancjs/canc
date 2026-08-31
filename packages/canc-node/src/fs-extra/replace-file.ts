import { basename, dirname, join } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { chmod, chown, rename, stat, unlink, writeFile } from './fs-calls';

export interface IReplaceFileOptions {
  encoding?: BufferEncoding | null;
  mode?: number | string;
  flag?: string;
  flush?: boolean;
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
export function replaceFile(
  path: string,
  data:
    | string
    | NodeJS.ArrayBufferView
    | Iterable<string | NodeJS.ArrayBufferView>
    | AsyncIterable<string | NodeJS.ArrayBufferView>,
  options?: IReplaceFileOptions | BufferEncoding | null,
): CancelablePromise<void>;
export function replaceFile(path: string, data: any, options?: any): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const dir = dirname(path);
    const base = basename(path);
    const tempPath = join(
      dir,
      `.${base}.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    );

    let activePromise: any = null;
    let isRenamed = false;

    handleCancel((reason) => {
      if (typeof activePromise?.cancel === 'function') {
        activePromise.cancel(reason);
      }
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
            (st: any) => {
              const chmodPromise = (activePromise = chmod(tempPath, st.mode));
              return chmodPromise
                .then(() => {
                  if (typeof st.uid === 'number' && typeof st.gid === 'number') {
                    const chownPromise = (activePromise = chown(tempPath, st.uid, st.gid));
                    return chownPromise.then(undefined, (err: any) => {
                      if (err?.code !== 'EPERM' && err?.code !== 'ENOSYS') {
                        throw err;
                      }
                    });
                  }
                  return undefined;
                })
                .then(undefined, (err: any) => {
                  if (err?.code !== 'EPERM' && err?.code !== 'ENOSYS') {
                    throw err;
                  }
                });
            },
            (err: any) => {
              if (err?.code === 'ENOENT') {
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
        .then(undefined, (err: any) => {
          if (!isRenamed) {
            unlink(tempPath).catch(() => {});
          }
          throw err;
        }),
    );
  });
}
