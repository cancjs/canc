import { isFunction, isObjectLike } from '../guards';

export interface ISourceNormalized<T> {
  it: AsyncIterator<T>;
  async: true;
}

export function getSource<T>(source: AsyncIterable<T> | Iterable<T>): ISourceNormalized<T> {
  if (isObjectLike(source) && isFunction((source as any)[Symbol.asyncIterator])) {
    return {
      it: (source as AsyncIterable<T>)[Symbol.asyncIterator](),
      async: true,
    };
  }

  if (isObjectLike(source) && isFunction((source as any)[Symbol.iterator])) {
    return {
      it: wrapSyncIterator((source as Iterable<T>)[Symbol.iterator]()),
      async: true,
    };
  }

  throw new TypeError('Source must be an iterable or async iterable');
}

function wrapSyncIterator<T>(syncIt: Iterator<T>): AsyncIterator<T> {
  return {
    next(value?: any): Promise<IteratorResult<T>> {
      return Promise.resolve(syncIt.next(value));
    },
    return(value?: any): Promise<IteratorResult<T, any>> {
      if (syncIt.return) {
        return Promise.resolve(syncIt.return(value));
      }
      return Promise.resolve({ done: true, value });
    },
    throw(error?: any): Promise<IteratorResult<T>> {
      if (syncIt.throw) {
        return Promise.resolve(syncIt.throw(error));
      }
      const err = error instanceof Error ? error : new Error(String(error));
      return Promise.reject(err);
    },
  };
}

export function callReturn(it: AsyncIterator<any>): Promise<void> {
  if (!it.return) {
    return Promise.resolve();
  }

  try {
    const result = it.return();
    if (typeof result?.then === 'function') {
      return Promise.resolve(result).then(
        () => {
          /**/
        },
        () => {
          /**/
        },
      );
    }
    return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}
