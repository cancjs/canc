import * as native from './index';
import { delay } from './index';

describe('index exports', () => {
  it('exposes the reduced timing/retry/promisify surface, nothing canc-only', () => {
    const keys = Object.keys(native).sort();
    expect(keys).toEqual(
      [
        'LazyPromise',
        'TimeoutError',
        'debounce',
        'defer',
        'delay',
        'isLazyPromise',
        'isTimeoutError',
        'lazy',
        'minDelay',
        'promisify',
        'promisifyAll',
        'retry',
        'throttle',
        'timeout',
        'waitFor',
      ].sort(),
    );
  });

  it('("cancel" in delay(1)) is false: returned promises are never cancelable', () => {
    expect('cancel' in delay(1)).toBe(false);
  });
});
