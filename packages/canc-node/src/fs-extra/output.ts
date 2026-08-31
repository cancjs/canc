import { dirname } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { ensureDir } from './ensure';
import { IWriteFileOptions, TWriteData, writeFile } from './fs-calls';

export type IOutputFileOptions = IWriteFileOptions;

/**
 * Writes a file, creating any missing parent directories first.
 *
 * @param path - File path to write.
 * @param data - File contents.
 * @param options - Encoding, mode and flag, or the encoding shorthand.
 */
export function outputFile(
  path: string,
  data: TWriteData,
  options?: IOutputFileOptions | BufferEncoding | null,
): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<unknown> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    activePromise = ensureDir(dirname(path));
    resolve(
      activePromise.then(() => {
        activePromise = writeFile(path, data, options);
        return activePromise.then(() => undefined);
      }),
    );
  });
}
