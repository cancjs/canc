import { dirname } from 'node:path';

import { CancelablePromise } from '@cancjs/promise';

import { ensureDir } from './ensure';
import { writeFile } from './fs-calls';

export function outputFile(path: string, data: any, options?: any): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let activePromise: CancelablePromise<any> | null = null;
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
