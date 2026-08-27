import * as native from './index';
import { delay } from './index';

describe('index exports', () => {
  it('exposes the reduced timing/retry/promisify surface, nothing canc-only', () => {
    const keys = Object.keys(native).sort();
    expect(keys).toEqual(
      [
        'AbortError',
        'catchAbort',
        'catchTimeout',
        'createCatchError',
        'createLazyPromise',
        'createSuppressError',
        'debounce',
        'defer',
        'delay',
        'isAbortError',
        'isLazyPromise',
        'isSupersededError',
        'isTimeoutError',
        'LazyPromise',
        'lazy',
        'limit',
        'minDelay',
        'promisify',
        'promisifyAll',
        'retry',
        'suppressAbort',
        'suppressTimeout',
        'SupersededError',
        'throttle',
        'timeout',
        'TimeoutError',
        'waitFor',
      ].sort(),
    );
  });

  it('("cancel" in delay(1)) is false: returned promises are never cancelable', () => {
    expect('cancel' in delay(1)).toBe(false);
  });
});
