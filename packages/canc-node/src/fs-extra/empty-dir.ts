import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { ensureDir } from './ensure';

/**
 * Internal helper to empty a directory taking an explicit AbortSignal.
 */
async function emptyDirHelper(dir: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();

  await ensureDir(dir);
  signal.throwIfAborted();

  const entries = await readdir(dir);
  signal.throwIfAborted();

  for (const entry of entries) {
    signal.throwIfAborted();
    const fullPath = join(dir, entry);
    await rm(fullPath, { recursive: true, force: true });
  }
}

/**
 * Ensures that a directory is empty. Deletes all directory contents if it is not empty.
 * If the directory does not exist, it is created. The directory itself is not deleted.
 *
 * @param dir - Directory path to empty
 */
export function emptyDir(dir: string): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const controller = new AbortController();
    handleCancel(() => {
      controller.abort();
    });
    resolve(emptyDirHelper(dir, controller.signal));
  });
}
