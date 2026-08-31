import { dirname, join } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { isExistsError } from '../errors/errno';
import { ensureDir } from './ensure';
import { cancelScope, copyFile, ICancelScope, lstat, readdir, readlink, symlink, unlink } from './fs-calls';

/**
 * Options for copy operation.
 */
export interface ICopyOptions {
  /**
   * Overwrite existing file or directory.
   *
   * @default true
   */
  overwrite?: boolean;
  /**
   * Function to filter copied files/directories.
   * Return true to include, false to exclude.
   * Applied to source entry only.
   */
  filter?: (src: string, dest: string) => boolean | Promise<boolean>;
  /**
   * Progress callback invoked after each file/directory/symlink entry is copied.
   */
  onProgress?: (progress: { src: string; dest: string }) => void;
}

/**
 * Internal recursive helper taking an explicit cancel scope.
 */
export async function copyTree(
  src: string,
  dest: string,
  options: ICopyOptions | undefined,
  scope: ICancelScope,
): Promise<void> {
  scope.signal.throwIfAborted();

  if (options?.filter) {
    const shouldCopy = await options.filter(src, dest);
    scope.signal.throwIfAborted();
    if (!shouldCopy) {
      return;
    }
  }

  const stats = await scope.run(lstat(src));
  scope.signal.throwIfAborted();

  if (stats.isDirectory()) {
    await scope.run(ensureDir(dest));
    scope.signal.throwIfAborted();

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }

    const entries = await scope.run(readdir(src, { withFileTypes: true }));
    scope.signal.throwIfAborted();

    for (const entry of entries) {
      scope.signal.throwIfAborted();
      await copyTree(join(src, entry.name), join(dest, entry.name), options, scope);
    }
  } else if (stats.isSymbolicLink()) {
    await scope.run(ensureDir(dirname(dest)));
    scope.signal.throwIfAborted();

    const linkTarget = await scope.run(readlink(src));
    scope.signal.throwIfAborted();

    if (options?.overwrite ?? true) {
      try {
        await scope.run(symlink(linkTarget, dest));
      } catch (err) {
        scope.signal.throwIfAborted();
        if (!isExistsError(err)) {
          throw err;
        }
        await scope.run(unlink(dest));
        scope.signal.throwIfAborted();
        await scope.run(symlink(linkTarget, dest));
      }
    } else {
      await scope.run(symlink(linkTarget, dest));
    }
    scope.signal.throwIfAborted();

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }
  } else {
    await scope.run(ensureDir(dirname(dest)));
    scope.signal.throwIfAborted();

    const flags = (options?.overwrite ?? true) ? 0 : 1;
    await scope.run(copyFile(src, dest, flags));
    scope.signal.throwIfAborted();

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }
  }
}

/**
 * Copy a file or directory tree from src to dest.
 *
 * @param src - Source path
 * @param dest - Destination path
 * @param options - Copy options
 */
export function copy(src: string, dest: string, options?: ICopyOptions): CancelablePromise<void> {
  return new CancelablePromise((resolve, _reject, { getSignal, handleCancel }) => {
    const scope = cancelScope(getSignal);
    handleCancel((reason) => {
      scope.cancel(reason);
    });
    resolve(copyTree(src, dest, options, scope));
  });
}
