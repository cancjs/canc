import { dirname } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { writeFile } from '../fs';
import { writeFileSync } from '../fs/sync';
import { ensureDir, ensureDirSync } from './ensure';

type TWriteFileParams = Parameters<typeof writeFile>;
type TWriteData = TWriteFileParams[1];

export type IOutputFileOptions = TWriteFileParams[2];

type TWriteFileSyncParams = Parameters<typeof writeFileSync>;
type TWriteFileSyncData = TWriteFileSyncParams[1];

export type IOutputFileSyncOptions = TWriteFileSyncParams[2];

/**
 * Writes a file, creating any missing parent directories first.
 *
 * @param path - File path to write.
 * @param data - File contents.
 * @param options - Encoding, mode and flag, or the encoding shorthand.
 */
export function outputFile(path: string, data: TWriteData, options?: IOutputFileOptions): CancelablePromise<void> {
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

/**
 * Writes a file synchronously, creating any missing parent directories first.
 *
 * @param path - File path to write.
 * @param data - File contents.
 * @param options - Encoding, mode and flag, or the encoding shorthand.
 */
export function outputFileSync(path: string, data: TWriteFileSyncData, options?: IOutputFileSyncOptions): void {
  ensureDirSync(dirname(path));
  writeFileSync(path, data, options);
}
