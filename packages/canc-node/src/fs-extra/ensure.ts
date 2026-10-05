import { dirname } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { EISDIR, isExistsError, isNotFoundError } from '../errors/errno';
import { link, lstat, mkdir, stat, symlink, writeFile } from '../fs';
import { linkSync, lstatSync, mkdirSync, statSync, symlinkSync, writeFileSync } from '../fs/sync';

export function ensureDir(path: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const p = mkdir(path, { recursive: true });
    handleCancel((reason) => {
      p.cancel(reason);
    });
    resolve(
      p
        .then(() => undefined)
        .catch((err: unknown) => {
          if (isExistsError(err)) {
            return undefined;
          }
          throw err;
        }),
    );
  });
}

/**
 * Ensures that the directory exists. If the directory structure does not exist, it is created.
 *
 * @param path - Directory path to ensure.
 */
export function ensureDirSync(path: string): void {
  try {
    mkdirSync(path, { recursive: true });
  } catch (err: unknown) {
    if (isExistsError(err)) {
      return;
    }
    throw err;
  }
}

export function ensureFile(path: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<unknown> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    const statPromise = stat(path);
    activePromise = statPromise;
    resolve(
      statPromise
        .then((stats) => {
          if (!stats.isFile()) {
            const err: EISDIR = Object.assign(new Error(`expected a file, got directory: ${path}`), {
              code: 'EISDIR' as const,
            });
            throw err;
          }
          return undefined;
        })
        .catch((err: unknown) => {
          if (isNotFoundError(err)) {
            activePromise = ensureDir(dirname(path));
            return activePromise.then(() => {
              activePromise = writeFile(path, '');
              return activePromise.then(() => undefined);
            });
          }
          throw err;
        }),
    );
  });
}

/**
 * Ensures that the file exists. If the requested file does not exist, it is created.
 *
 * @param path - File path to ensure.
 */
export function ensureFileSync(path: string): void {
  try {
    const stats = statSync(path);
    if (!stats.isFile()) {
      const err: EISDIR = Object.assign(new Error(`expected a file, got directory: ${path}`), {
        code: 'EISDIR' as const,
      });
      throw err;
    }
  } catch (err: unknown) {
    if (isNotFoundError(err)) {
      ensureDirSync(dirname(path));
      writeFileSync(path, '');
      return;
    }
    throw err;
  }
}

export function ensureLink(srcPath: string, dstPath: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<unknown> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    activePromise = lstat(dstPath);
    resolve(
      activePromise
        .then(() => undefined)
        .catch((err: unknown) => {
          if (isNotFoundError(err)) {
            activePromise = ensureDir(dirname(dstPath));
            return activePromise.then(() => {
              activePromise = link(srcPath, dstPath);
              return activePromise.then(() => undefined);
            });
          }
          throw err;
        }),
    );
  });
}

/**
 * Ensures that the hard link exists. If the link does not exist, it is created.
 *
 * @param srcPath - Source file path.
 * @param dstPath - Destination link path.
 */
export function ensureLinkSync(srcPath: string, dstPath: string): void {
  try {
    lstatSync(dstPath);
  } catch (err: unknown) {
    if (isNotFoundError(err)) {
      ensureDirSync(dirname(dstPath));
      linkSync(srcPath, dstPath);
      return;
    }
    throw err;
  }
}

export function ensureSymlink(srcPath: string, dstPath: string, type?: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<unknown> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    activePromise = lstat(dstPath);
    resolve(
      activePromise
        .then(() => undefined)
        .catch((err: unknown) => {
          if (isNotFoundError(err)) {
            activePromise = ensureDir(dirname(dstPath));
            return activePromise.then(() => {
              activePromise = symlink(srcPath, dstPath, type);
              return activePromise.then(() => undefined);
            });
          }
          throw err;
        }),
    );
  });
}

type TSymlinkType = Parameters<typeof symlinkSync>[2];

/**
 * Ensures that the symbolic link exists. If the symlink does not exist, it is created.
 *
 * @param srcPath - Source path.
 * @param dstPath - Destination symlink path.
 * @param type - Optional symlink type.
 */
export function ensureSymlinkSync(srcPath: string, dstPath: string, type?: TSymlinkType): void {
  try {
    lstatSync(dstPath);
  } catch (err: unknown) {
    if (isNotFoundError(err)) {
      ensureDirSync(dirname(dstPath));
      symlinkSync(srcPath, dstPath, type);
      return;
    }
    throw err;
  }
}

/** @deprecated Use ensureDir instead */
export const mkdirp = ensureDir;
/** @deprecated Use ensureDir instead */
export const mkdirs = ensureDir;

/** @deprecated Use ensureDirSync instead */
export const mkdirpSync = ensureDirSync;
/** @deprecated Use ensureDirSync instead */
export const mkdirsSync = ensureDirSync;
