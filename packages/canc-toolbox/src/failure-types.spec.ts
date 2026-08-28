import { CancelablePromise, TimeoutError } from '@cancjs/promise';

import { debounce, defer, delay, minDelay, promisify, retry, throttle, timeout, waitFor } from './index';

describe('failure type specs', () => {
  it('types failures correctly', () => {
    const p1: CancelablePromise<void, never> = delay(100);
    const p2: CancelablePromise<never, TimeoutError> = timeout(100);
    const p3: CancelablePromise<void, TimeoutError> = waitFor(() => true);
    const p4: CancelablePromise<number, Error> = retry<number, Error>(() => 1);
    const p5: CancelablePromise<number, TypeError> = minDelay<number, TypeError>(1, 100);

    const d = debounce<[string], void, Error>(() => {}, 100);
    const p6: CancelablePromise<void, Error> = d('x');

    const t = throttle<[string], void, Error>(() => {}, 100);
    const p7: CancelablePromise<void, Error> = t('x');

    const pr = promisify(() => {});
    const p8: CancelablePromise<any, never> = pr();

    const df = defer();
    const p9: CancelablePromise<void, never> = df.promise;

    p1.cancel();
    p2.cancel();
    p3.cancel();
    p4.cancel();
    p5.cancel();
    p6.cancel();
    p7.cancel();
    p8.cancel();
    p9.cancel();
    d.cancel();
    t.cancel();
  });
});
