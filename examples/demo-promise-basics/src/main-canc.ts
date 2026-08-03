import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';
import { sleep } from '@shared/util';

import { loadProfileCancelable } from './profile-service-canc';

async function main(): Promise<void> {
  const mockApi = createMockApi({ latency: 100, jitter: 0, trace: console.log });

  // Down: cancel the load, catch a plain CancelError.
  {
    console.log('canc: start load');
    const pending = loadProfileCancelable(mockApi.products, 'p1');

    // The caller loses interest after a short delay. cancel() stops the underlying fetch.
    setTimeout(() => {
      pending.cancel();
      console.log('canc: cancel() called');
    }, 30);

    try {
      await pending;
      console.log('canc: profile loaded');
    } catch (error) {
      if (isCancelError(error)) {
        // cancellation is just a rejection, regular catch works.
        console.log('canc: caught CancelError, one cancel() call, no threading, built-in state');
      } else {
        throw error;
      }
    }
  }

  console.log('');

  // Awaiting cancel() waits for all handlers to settle, proving cancellation is synchronous
  // under the hood but its effects (cleanup) are observable.
  {
    console.log('canc: await cancel() ordering');
    const pending = loadProfileCancelable(mockApi.products, 'p2');
    pending.cancel();
    await pending.cancel(); // Already canceled, but await proves handlers ran.
    console.log('canc: done');
  }

  console.log('');

  // Up: a child cancel bubbles to auto-cancel the source. A bare AbortController has no
  // equivalent: only the holder of the controller can abort, and it has no notion of "every
  // consumer lost interest, stop on its own."
  {
    console.log('canc: start load (two consumers, no direct cancel on the source)');
    const pending = loadProfileCancelable(mockApi.products, 'p3');
    const forDisplay = pending.then((profile) => profile.name);
    const forPrefetch = pending.then((profile) => profile.id);
    forDisplay.catch(() => {
      /* consumer-side cancellation, checked via pending.isCanceled below */
    });
    forPrefetch.catch(() => {
      /* consumer-side cancellation, checked via pending.isCanceled below */
    });

    // Neither consumer ever touches `pending` itself, only its own branch.
    forDisplay.cancel();
    forPrefetch.cancel();
    console.log('canc: both consumers canceled');

    await sleep(0);
    console.log(`canc: source auto-canceled (bubbled) = ${pending.isCanceled}`);
  }
}

main();
