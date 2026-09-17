import { dirname, join } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { isExistsError } from '../errors/errno';
import { copyFile, lstat, readdir, readlink, symlink, unlink } from '../fs';
import { copyFileSync, lstatSync, readdirSync, readlinkSync, symlinkSync, unlinkSync } from '../fs/sync';
import { ensureDir, ensureDirSync } from './ensure';

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
   * When true and overwrite is false, throw an error if destination exists.
   * When false and overwrite is false, silently skip existing files and symlinks.
   *
   * @default false
   */
  errorOnExist?: boolean;
  /**
   * Function to filter copied files/directories.
   * Return true to include, false to exclude.
   * Applied to source entry only.
   */
  filter?: (src: string, dest: string) => boolean | Promise<boolean>;
  /**
   * Progress callback invoked after each file/directory/symlink entry is copied.
   * Not invoked for skipped entries.
   */
  onProgress?: (progress: { src: string; dest: string }) => void;
}

/**
 * The call presently in flight, so a cancel reaches it directly instead of waiting for
 * the next checkpoint.
 * Single-slot register only safe because copyTree is strictly sequential.
 * Needed because node accepts signal for lstat/stat only; readdir, readlink, symlink,
 * unlink, copyFile, ensureDir have no signal, so canceling our inner promise is the only
 * way to interrupt them.
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

/**
 * Internal recursive helper taking an explicit signal.
 */
export async function copyTree(
  src: string,
  dest: string,
  options: ICopyOptions | undefined,
  signal: AbortSignal,
  active: IActiveCall,
): Promise<void> {
  signal.throwIfAborted();

  if (options?.filter) {
    const shouldCopy = await options.filter(src, dest);
    signal.throwIfAborted();
    if (!shouldCopy) {
      return;
    }
  }

  const stats = await (active.current = lstat(src, statOptionsWithSignal(signal)));
  signal.throwIfAborted();

  if (stats.isDirectory()) {
    await (active.current = ensureDir(dest));
    signal.throwIfAborted();

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }

    const entries = await (active.current = readdir(src, { withFileTypes: true }));
    signal.throwIfAborted();

    for (const entry of entries) {
      signal.throwIfAborted();
      await copyTree(join(src, entry.name), join(dest, entry.name), options, signal, active);
    }
  } else if (stats.isSymbolicLink()) {
    await (active.current = ensureDir(dirname(dest)));
    signal.throwIfAborted();

    const linkTarget = await (active.current = readlink(src));
    signal.throwIfAborted();

    if (options?.overwrite ?? true) {
      try {
        await (active.current = symlink(linkTarget, dest));
      } catch (err) {
        signal.throwIfAborted();
        if (!isExistsError(err)) {
          throw err;
        }
        await (active.current = unlink(dest));
        signal.throwIfAborted();
        await (active.current = symlink(linkTarget, dest));
      }
    } else {
      try {
        await (active.current = symlink(linkTarget, dest));
      } catch (err) {
        signal.throwIfAborted();
        if (isExistsError(err)) {
          if (options?.errorOnExist) {
            throw err;
          }
          return;
        }
        throw err;
      }
    }
    signal.throwIfAborted();

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }
  } else {
    await (active.current = ensureDir(dirname(dest)));
    signal.throwIfAborted();

    const flags = (options?.overwrite ?? true) ? 0 : 1;
    try {
      await (active.current = copyFile(src, dest, flags));
    } catch (err) {
      signal.throwIfAborted();
      if (isExistsError(err) && !(options?.overwrite ?? true)) {
        if (options?.errorOnExist) {
          throw err;
        }
        return;
      }
      throw err;
    }
    signal.throwIfAborted();

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }
  }
}

/**
 * Internal synchronous recursive helper.
 */
export function copyTreeSync(src: string, dest: string, options?: ICopyOptions): void {
  if (options?.filter) {
    const shouldCopy = options.filter(src, dest);
    if (!shouldCopy) {
      return;
    }
  }

  const stats = lstatSync(src);

  if (stats.isDirectory()) {
    ensureDirSync(dest);

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }

    const entries = readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      copyTreeSync(join(src, entry.name), join(dest, entry.name), options);
    }
  } else if (stats.isSymbolicLink()) {
    ensureDirSync(dirname(dest));

    const linkTarget = readlinkSync(src);

    if (options?.overwrite ?? true) {
      try {
        symlinkSync(linkTarget, dest);
      } catch (err) {
        if (!isExistsError(err)) {
          throw err;
        }
        unlinkSync(dest);
        symlinkSync(linkTarget, dest);
      }
    } else {
      try {
        symlinkSync(linkTarget, dest);
      } catch (err) {
        if (isExistsError(err)) {
          if (options?.errorOnExist) {
            throw err;
          }
          return;
        }
        throw err;
      }
    }

    if (options?.onProgress) {
      options.onProgress({ src, dest });
    }
  } else {
    ensureDirSync(dirname(dest));

    const flags = (options?.overwrite ?? true) ? 0 : 1;
    try {
      copyFileSync(src, dest, flags);
    } catch (err) {
      if (isExistsError(err) && !(options?.overwrite ?? true)) {
        if (options?.errorOnExist) {
          throw err;
        }
        return;
      }
      throw err;
    }

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
    const signal = getSignal() as AbortSignal;
    const active: IActiveCall = { current: null };
    handleCancel((reason) => {
      active.current?.cancel(reason);
    });
    resolve(copyTree(src, dest, options, signal, active));
  });
}
