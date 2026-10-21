import { CancelablePromise } from '@cancjs/promise';

import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import { debounce, limit, map, throttle } from './index';

class HttpError extends Error {
  readonly status: number = 500;
}

declare const callWork: (id: string) => CancelablePromise<number, HttpError>;
declare const callNative: (id: string) => Promise<number>;

// compile-only: a native result carries no failure set, whatever the cancelable twin declares
function _nativeResults(): void {
  const _mapped = map(['x'], callWork);
  const _mapIsPlain: Eq<typeof _mapped, Promise<number[]>> = true;

  const _mappedNative = map(['x'], callNative);
  const _mapOfNativeIsPlain: Eq<typeof _mappedNative, Promise<number[]>> = true;

  const _limited = limit(1)(callWork, 'x');
  const _limitIsPlain: Eq<typeof _limited, Promise<number>> = true;

  const _debounced = debounce(callNative, 100);
  const _debounceIsPlain: Eq<ReturnType<typeof _debounced>, Promise<number>> = true;

  const _throttled = throttle(callNative, 100);
  const _throttleIsPlain: Eq<ReturnType<typeof _throttled>, Promise<number>> = true;

  const _mapReasonReadsErrors = _mapped.catch((e) => e.errors);
  const _limitReasonReadsName = _limited.catch((e) => e.name);

  void [
    _mapIsPlain,
    _mapOfNativeIsPlain,
    _limitIsPlain,
    _debounceIsPlain,
    _throttleIsPlain,
    _mapReasonReadsErrors,
    _limitReasonReadsName,
  ];
}

describe('native failure types', () => {
  it('compiles the native result types', () => {
    expect(typeof _nativeResults).toBe('function');
  });
});
