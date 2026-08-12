import { CancelablePromise, TimeoutError } from '@cancjs/promise';

import { debounce, defer, delay, minDelay, promisify, retry, throttle, timeout, waitFor } from './index';

describe('failure type specs', () => {
  it('types failures correctly', () => {
    const _p1: CancelablePromise<void, never> = delay(100);
    const _p2: CancelablePromise<never, TimeoutError> = timeout(100);
    const _p3: CancelablePromise<void, TimeoutError> = waitFor(() => true);
    const _p4: CancelablePromise<number, Error> = retry<number, Error>(() => 1);
    const _p5: CancelablePromise<number, TypeError> = minDelay<number, TypeError>(1, 100);

    const d = debounce<[string], void, Error>(() => {}, 100);
    const _p6: CancelablePromise<void, Error> = d('x');

    const t = throttle<[string], void, Error>(() => {}, 100);
    const _p7: CancelablePromise<void, Error> = t('x');

    const pr = promisify(() => {});
    const _p8: CancelablePromise<any, never> = pr();

    const df = defer();
    const _p9: CancelablePromise<void, never> = df.promise;
  });
});
