// CancelablePromise with bubble:false isolates input from siblings' fate.
// When all siblings cancel, the isolated input survives (remains pending).

import { CancelablePromise } from '@cancjs/promise';
import { sleep } from '@shared/util';

const completed: string[] = [];
const canceled: string[] = [];

function loadWidget(name: string, delay: number, isolated: boolean = false): CancelablePromise<string> {
  return new CancelablePromise(
    (resolve, reject, onCancel) => {
      const timeout = setTimeout(() => {
        if (name === 'alerts') {
          reject(new Error('alerts failed'));
        } else {
          completed.push(name);
          resolve(name);
        }
      }, delay);

      onCancel(() => {
        clearTimeout(timeout);
        canceled.push(name);
        reject(new Error(`${name} canceled`));
      });
    },
    { bubble: isolated ? false : true },
  );
}

async function runIsolationCanc(): Promise<void> {
  const results = CancelablePromise.all([
    loadWidget('sales', 50),
    loadWidget('traffic', 50),
    loadWidget('alerts', 10),
    loadWidget('news', 50, true), // bubble:false (isolated)
  ]);

  try {
    await results;
  } catch {
    // canceled here, but "news" survives due to bubble:false
  }

  await sleep(100);
  console.log(`Canc isolation - completed: ${completed.length}, canceled: ${canceled.length}`);
}

export { runIsolationCanc };
