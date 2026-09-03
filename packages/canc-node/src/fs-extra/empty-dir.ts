import { join } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { readdir, rm } from '../fs';
import { ensureDir } from './ensure';

/**
 * The call presently in flight, so a cancel reaches it directly instead of waiting for
 * the next checkpoint.
 * Single-slot register only safe because emptyDirTree is strictly sequential.
 * Needed because node accepts signal for lstat/stat only; readdir, rm and other calls
 * have no signal, so canceling our inner promise is the only way to interrupt them.
 */
interface IActiveCall {
  current: CancelablePromise<unknown> | null;
}

/**
 * Internal helper to empty a directory taking an explicit signal.
 */
async function emptyDirTree(dir: string, signal: AbortSignal, active: IActiveCall): Promise<void> {
  signal.throwIfAborted();

  await (active.current = ensureDir(dir));
  signal.throwIfAborted();

  const entries = await (active.current = readdir(dir));
  signal.throwIfAborted();

  for (const entry of entries) {
    signal.throwIfAborted();
    await (active.current = rm(join(dir, entry), { recursive: true, force: true }));
  }
}

/**
 * Ensures that a directory is empty. Deletes all directory contents if it is not empty.
 * If the directory does not exist, it is created. The directory itself is not deleted.
 *
 * @param dir - Directory path to empty
 */
export function emptyDir(dir: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, _reject, { getSignal, handleCancel }) => {
    const signal = getSignal() as AbortSignal;
    const active: IActiveCall = { current: null };
    handleCancel((reason) => {
      active.current?.cancel(reason);
    });
    resolve(emptyDirTree(dir, signal, active));
  });
}
