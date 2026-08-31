import { dirname } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { link, lstat, mkdir, stat, symlink, writeFile } from '../fs';

export function ensureDir(path: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const p = mkdir(path, { recursive: true });
    handleCancel((reason) => {
      p.cancel(reason);
    });
    resolve(
      p
        .then(() => undefined)
        .catch((err: any) => {
          if (err?.code === 'EEXIST') {
            return undefined;
          }
          throw err;
        }),
    );
  });
}

export function ensureFile(path: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<any> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    activePromise = stat(path);
    resolve(
      activePromise
        .then(() => undefined)
        .catch((err: any) => {
          if (err?.code === 'ENOENT') {
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

export function ensureLink(srcPath: string, dstPath: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<any> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    activePromise = lstat(dstPath);
    resolve(
      activePromise
        .then(() => undefined)
        .catch((err: any) => {
          if (err?.code === 'ENOENT') {
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

export function ensureSymlink(srcPath: string, dstPath: string, type?: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<any> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    activePromise = lstat(dstPath);
    resolve(
      activePromise
        .then(() => undefined)
        .catch((err: any) => {
          if (err?.code === 'ENOENT') {
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

/** @deprecated Use ensureDir instead */
export const mkdirp = ensureDir;
/** @deprecated Use ensureDir instead */
export const mkdirs = ensureDir;
