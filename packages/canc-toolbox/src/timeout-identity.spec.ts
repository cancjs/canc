import { CancelablePromise, TimeoutError as CoreTimeoutError } from '@cancjs/promise';

import { timeout, TimeoutError } from './index';

describe('TimeoutError identity', () => {
  it('exports the same TimeoutError class as @cancjs/promise', () => {
    expect(TimeoutError).toBe(CoreTimeoutError);
  });

  it('rejects with an error that passes instanceof against the exported class', async () => {
    const p = new CancelablePromise(() => {}); // never resolves
    const err = await timeout(p, 10).catch((e) => e);

    expect(err).toBeInstanceOf(TimeoutError);
    expect(err).toBeInstanceOf(CoreTimeoutError);
  });
});
