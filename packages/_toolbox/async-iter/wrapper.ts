import type { IPipeableAsyncIterable } from './types';
import { PIPEABLE_BRAND } from './types';

export function createPipeableWrapper<T>(
  asyncIterable: AsyncIterable<T>,
  pipeMethod: (...parts: any[]) => any,
): IPipeableAsyncIterable<T> {
  const wrapper: IPipeableAsyncIterable<T> = {
    [PIPEABLE_BRAND]: true,
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return asyncIterable[Symbol.asyncIterator]();
    },
    pipe: null as any,
  };
  wrapper.pipe = pipeMethod.bind(wrapper);
  return wrapper;
}
