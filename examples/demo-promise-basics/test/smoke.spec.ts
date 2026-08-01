import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';

import { loadProfileCancelable } from '../src/profile-service-canc';

describe('demo-promise-basics smoke', () => {
  it('cancel() stops the underlying request and rejects with CancelError', async () => {
    const mockApi = createMockApi({ seedMode: true });

    // Create a cancelable profile load.
    const pending = loadProfileCancelable(mockApi.products, 'p1');

    // Cancel before the latency completes.
    pending.cancel();

    let caught: unknown;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }

    // The rejection must be a CancelError, caught by ordinary try/catch.
    expect(isCancelError(caught)).toBe(true);
    expect(pending.isCanceled).toBe(true);

    // The mock API must have logged an abort (proving cancel reached the network call).
    const abortCall = mockApi.api.calls.find((call) => call.status === 'aborted');
    expect(abortCall).toBeDefined();
  });

  it('canceling every consumer bubbles up and auto-cancels the source', async () => {
    const mockApi = createMockApi({ seedMode: true });

    const pending = loadProfileCancelable(mockApi.products, 'p2');
    const forDisplay = pending.then((profile) => profile.name);
    const forPrefetch = pending.then((profile) => profile.id);
    forDisplay.catch(() => {
      /* asserted below */
    });
    forPrefetch.catch(() => {
      /* asserted below */
    });

    // Neither consumer touches `pending` directly. Both canceling is what bubbles.
    forDisplay.cancel();
    forPrefetch.cancel();

    await Promise.resolve();
    await Promise.resolve();

    expect(pending.isCanceled).toBe(true);
  });
});
