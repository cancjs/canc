import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';
import { createZipArchive } from './index';
import type { TZipFilesOptions } from './types';
import { checkpointWalkWrapped } from './wrap';

/**
 * Writes `files` into a zip archive at `target`, one entry at a time. Requires Node 26.8 or later for
 * the archive builder; below that the returned promise rejects with `NotImplementedError`.
 *
 * Not a node API: a per-file helper beside `/zlib`'s `zipFiles`, which mirrors node's own. Canceling checkpoints at a file boundary: no further entry is added, the entries already written
 * stay in the archive, and the archive is closed so its file descriptor is released.
 *
 * @param files - Paths to add, in order.
 * @param target - Path of the zip archive to write.
 * @param options - Passed through to the archive builder.
 * @returns A promise settling once every entry is added and the archive is closed.
 */
export function zipFilesCheckpointed(
  files: readonly string[],
  target: string,
  options?: TZipFilesOptions,
): CancelablePromise<void, Unlisted> {
  return new CancelablePromise<void, Unlisted>((resolve, reject, { handleCancel }) => {
    // created inside the executor so a missing builder rejects this promise rather than throwing
    // out of the call, matching every other promise-returning export here
    const archive = createZipArchive(target, options);

    const walk = checkpointWalkWrapped<string, void>((file) => {
      archive.addEntry(file);
    });
    const walked = walk(files);

    handleCancel(() => {
      walked.cancel();
      archive.close();
    });

    walked.then(() => {
      archive.close();
      resolve();
    }, reject);
  });
}
