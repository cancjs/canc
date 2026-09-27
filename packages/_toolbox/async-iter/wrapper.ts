import type { IPipeableAsyncIterable } from './types';
import { isPipeable, PIPEABLE_BRAND } from './types';

export function createPipeableWrapper<T>(
  asyncIterable: AsyncIterable<T>,
  pipeMethod: (...parts: any[]) => any,
): IPipeableAsyncIterable<T> {
  // Avoid double-wrapping if already pipeable
  if (isPipeable(asyncIterable)) {
    return asyncIterable as IPipeableAsyncIterable<T>;
  }

  return {
    [PIPEABLE_BRAND]: true,
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return asyncIterable[Symbol.asyncIterator]();
    },
    pipe: pipeMethod,
  };
}
