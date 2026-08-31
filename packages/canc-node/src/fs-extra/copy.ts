import { copyFile, lstat, readdir, readlink, symlink, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { ensureDir } from './ensure';

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
 * Internal recursive helper taking an explicit AbortSignal.
 */
async function copyTree(
  src: string,
  dest: string,
  options: ICopyOptions | undefined,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();

  if (options?.filter) {
    const shouldCopy = await options.filter(src, dest);
    signal.throwIfAborted();
    if (!shouldCopy) {
      return;
    }
  }

  const stat = await lstat(src);
  signal.throwIfAborted();

  if (stat.isDirectory()) {
    await ensureDir(dest);
    signal.throwIfAborted();

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }

    const entries = await readdir(src, { withFileTypes: true });
    signal.throwIfAborted();

    for (const entry of entries) {
      signal.throwIfAborted();
      const childSrc = join(src, entry.name);
      const childDest = join(dest, entry.name);
      await copyTree(childSrc, childDest, options, signal);
    }
  } else if (stat.isSymbolicLink()) {
    await ensureDir(dirname(dest));
    signal.throwIfAborted();

    const linkTarget = await readlink(src);
    signal.throwIfAborted();

    if (options?.overwrite ?? true) {
      try {
        await symlink(linkTarget, dest);
      } catch (err: any) {
        signal.throwIfAborted();
        if (err?.code === 'EEXIST') {
          await unlink(dest);
          signal.throwIfAborted();
          await symlink(linkTarget, dest);
        } else {
          throw err;
        }
      }
    } else {
      await symlink(linkTarget, dest);
    }
    signal.throwIfAborted();

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }
  } else {
    await ensureDir(dirname(dest));
    signal.throwIfAborted();

    const flags = (options?.overwrite ?? true) ? 0 : 1;
    await copyFile(src, dest, flags);
    signal.throwIfAborted();

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
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const controller = new AbortController();
    handleCancel(() => {
      controller.abort();
    });
    resolve(copyTree(src, dest, options, controller.signal));
  });
}
