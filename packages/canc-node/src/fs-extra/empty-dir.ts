import { join } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { ensureDir } from './ensure';
import { cancelScope, ICancelScope, readdir, rm } from './fs-calls';

/**
 * Internal helper to empty a directory taking an explicit cancel scope.
 */
async function emptyDirTree(dir: string, scope: ICancelScope): Promise<void> {
  scope.signal.throwIfAborted();

  await scope.run(ensureDir(dir));
  scope.signal.throwIfAborted();

  const entries = await scope.run(readdir(dir));
  scope.signal.throwIfAborted();

  for (const entry of entries) {
    scope.signal.throwIfAborted();
    await scope.run(rm(join(dir, entry), { recursive: true, force: true }));
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
    const scope = cancelScope(getSignal);
    handleCancel((reason) => {
      scope.cancel(reason);
    });
    resolve(emptyDirTree(dir, scope));
  });
}
