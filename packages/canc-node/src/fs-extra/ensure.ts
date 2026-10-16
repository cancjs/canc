import type { BigIntStats, Stats } from 'node:fs';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';

import { link, lstat, mkdir, stat, symlink, writeFile } from '@cancjs/node/fs';
import { linkSync, lstatSync, mkdirSync, statSync, symlinkSync, writeFileSync } from '@cancjs/node/fs/sync';
import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';
import { EISDIR, ENOTDIR, isExistsError, isNotFoundError } from '../errors/errno';
import { areIdentical } from './utils';

function notDirError(path: string): ENOTDIR {
  return Object.assign(new Error(`ENOTDIR: not a directory, mkdir '${path}'`), {
    code: 'ENOTDIR' as const,
    syscall: 'mkdir',
    path,
  });
}

export function ensureDir(path: string): CancelablePromise<void, Unlisted> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<unknown> = mkdir(path, { recursive: true });
    handleCancel((reason) => {
      activePromise.cancel(reason);
    });
    resolve(
      activePromise
        .then(() => undefined)
        .catch((err: unknown) => {
          if (!isExistsError(err)) {
            throw err;
          }
          // recursive mkdir reports EEXIST for an existing file too
          activePromise = stat(path);
          return activePromise.then((stats) => {
            if (!(stats as Stats).isDirectory()) {
              throw notDirError(path);
            }
            return undefined;
          });
        }),
    );
  });
}

/**
 * Ensures that the directory exists. If the directory structure does not exist, it is created.
 * Rejects with ENOTDIR when the path is an existing file.
 *
 * @param path - Directory path to ensure.
 */
export function ensureDirSync(path: string): void {
  try {
    mkdirSync(path, { recursive: true });
  } catch (err: unknown) {
    if (!isExistsError(err)) {
      throw err;
    }
    if (!statSync(path).isDirectory()) {
      throw notDirError(path);
    }
  }
}

export function ensureFile(path: string): CancelablePromise<void, Unlisted> {
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

export function ensureLink(srcPath: string, dstPath: string): CancelablePromise<void, Unlisted> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<unknown> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    const run = async (): Promise<void> => {
      const dstStat = await (activePromise = lstat(dstPath, {
        bigint: true,
      })).catch((err: unknown) => {
        if (isNotFoundError(err)) {
          return null;
        }
        throw err;
      });
      if (dstStat) {
        const srcStat = await (activePromise = lstat(srcPath, {
          bigint: true,
        }));
        if (areIdentical(srcStat, dstStat)) {
          return;
        }
      }
      await (activePromise = ensureDir(dirname(dstPath)));
      await (activePromise = link(srcPath, dstPath));
    };
    resolve(run());
  });
}

/**
 * Ensures that the hard link exists. If the link does not exist, it is created.
 *
 * @param srcPath - Source file path.
 * @param dstPath - Destination link path.
 */
export function ensureLinkSync(srcPath: string, dstPath: string): void {
  let dstStat: BigIntStats | undefined;
  try {
    dstStat = lstatSync(dstPath, { bigint: true });
  } catch (err: unknown) {
    if (!isNotFoundError(err)) {
      throw err;
    }
  }
  if (dstStat && areIdentical(lstatSync(srcPath, { bigint: true }), dstStat)) {
    return;
  }
  ensureDirSync(dirname(dstPath));
  linkSync(srcPath, dstPath);
}

export function ensureSymlink(srcPath: string, dstPath: string, type?: string): CancelablePromise<void, Unlisted> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<unknown> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    const run = async (): Promise<void> => {
      const dstLinkStat = await (activePromise = lstat(dstPath)).catch((err: unknown) => {
        if (isNotFoundError(err)) {
          return null;
        }
        throw err;
      });
      if (dstLinkStat?.isSymbolicLink()) {
        const srcStat = await (activePromise = stat(symlinkTargetPath(srcPath, dstPath), { bigint: true }));
        const dstStat = await (activePromise = stat(dstPath, { bigint: true }));
        if (areIdentical(srcStat, dstStat)) {
          return;
        }
      }
      await (activePromise = ensureDir(dirname(dstPath)));
      await (activePromise = symlink(srcPath, dstPath, type));
    };
    resolve(run());
  });
}

/** A relative symlink target resolves against the link's own directory, not the cwd. */
function symlinkTargetPath(srcPath: string, dstPath: string): string {
  return isAbsolute(srcPath) ? srcPath : resolvePath(dirname(dstPath), srcPath);
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
  let dstLinkStat: ReturnType<typeof lstatSync> | undefined;
  try {
    dstLinkStat = lstatSync(dstPath);
  } catch (err: unknown) {
    if (!isNotFoundError(err)) {
      throw err;
    }
  }
  if (dstLinkStat?.isSymbolicLink()) {
    const srcStat = statSync(symlinkTargetPath(srcPath, dstPath), {
      bigint: true,
    });
    if (areIdentical(srcStat, statSync(dstPath, { bigint: true }))) {
      return;
    }
  }
  ensureDirSync(dirname(dstPath));
  symlinkSync(srcPath, dstPath, type);
}

/** Alias of ensureDir, kept for fs-extra parity. */
export const mkdirp = ensureDir;
/** Alias of ensureDir, kept for fs-extra parity. */
export const mkdirs = ensureDir;

/** Alias of ensureDirSync, kept for fs-extra parity. */
export const mkdirpSync = ensureDirSync;
/** Alias of ensureDirSync, kept for fs-extra parity. */
export const mkdirsSync = ensureDirSync;
