import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IToolboxDeps, retryFactory, TPromiseCtor } from '../../../_toolbox';
import { lstat, rename } from '../fs';
import { copyTree } from './copy';
import { ensureDir } from './ensure';

interface ICancelableKind extends IPromiseKind {
  promise: CancelablePromise<this['value']>;
  options: object;
}

const deps: IToolboxDeps<ICancelableKind> = {
  Impl: CancelablePromise as unknown as TPromiseCtor,
  cancelable: true,
};

const retry = retryFactory(deps);

export interface IMoveOptions {
  /**
   * Overwrite existing destination file or directory.
   *
   * @default true
   */
  overwrite?: boolean;
}

function renameWithRetry(src: string, dest: string): CancelablePromise<void> {
  const p = retry(
    (_attempt: number) => {
      return Promise.resolve()
        .then(() => rename(src, dest))
        .catch((err: any) => {
          if (err?.code === 'EPERM' || err?.code === 'EBUSY' || err?.code === 'EMFILE' || err?.code === 'ENFILE') {
            throw err;
          }
          return { __cancNonRetriable: err } as any;
        });
    },
    { retries: 5, minTimeout: 10, factor: 1.5, maxTimeout: 500 },
  );

  return p.then((res: any) => {
    if (res && typeof res === 'object' && '__cancNonRetriable' in res) {
      return CancelablePromise.reject(res.__cancNonRetriable);
    }
    return res;
  });
}

async function moveAcrossDevice(
  src: string,
  dest: string,
  options: IMoveOptions | undefined,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await copyTree(src, dest, { overwrite: options?.overwrite ?? true }, signal);
  signal.throwIfAborted();
  await rm(src, { recursive: true, force: true });
}

/**
 * Moves a file or directory, with cross-device fallback using copy and delete.
 *
 * @param src - Source path to move.
 * @param dest - Destination path.
 * @param options - Options for the move operation.
 */
export function move(src: string, dest: string, options?: IMoveOptions): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const controller = new AbortController();
    let activePromise: CancelablePromise<any> | null = null;

    handleCancel((reason) => {
      controller.abort(reason);
      activePromise?.cancel(reason);
    });

    const checkDest =
      options?.overwrite === false ?
        (activePromise = lstat(dest)).then(
          () => {
            const err: any = new Error(`dest already exists: ${dest}`);
            err.code = 'EEXIST';
            throw err;
          },
          (err: any) => {
            if (err?.code === 'ENOENT') {
              return undefined;
            }
            throw err;
          },
        )
      : Promise.resolve();

    const p = checkDest
      .then(() => {
        controller.signal.throwIfAborted();
        const ensurePromise = (activePromise = ensureDir(dirname(dest)));
        return ensurePromise;
      })
      .then(() => {
        controller.signal.throwIfAborted();
        const renamePromise = (activePromise = renameWithRetry(src, dest));
        return renamePromise;
      })
      .catch((err: any) => {
        controller.signal.throwIfAborted();
        if (err?.code === 'EXDEV') {
          return moveAcrossDevice(src, dest, options, controller.signal);
        }
        throw err;
      });

    resolve(p);
  });
}
