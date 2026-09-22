import type { IAsyncIterOptions, TAnySource, TElementOf } from '../../../_toolbox/async-iter';
import { makePipeable } from '../../../_toolbox/async-iter/pipe';
import {
  concat as toolboxConcat,
  from as toolboxFrom,
  zip as toolboxZip,
  zipKeyed as toolboxZipKeyed,
} from '../../../_toolbox/async-iter/sources';
import type { ICancelablePipeable } from './pipe';

// every terminal reachable from the canc entry is canc-bound, which the shared wrapper cannot say
function pipeable<T>(source: AsyncIterable<T>): ICancelablePipeable<T> {
  return makePipeable(source) as ICancelablePipeable<T>;
}

/**
 * Wrap the toolbox from() with makePipeable to add the pipe method.
 */
export function from<T>(source: AsyncIterable<T>, opts?: IAsyncIterOptions): ICancelablePipeable<T>;
export function from<T>(source: Iterable<T | PromiseLike<T>>, opts?: IAsyncIterOptions): ICancelablePipeable<T>;
export function from<T>(source: PromiseLike<T>, opts?: IAsyncIterOptions): ICancelablePipeable<T>;
export function from<T>(source: TAnySource<T>, opts?: IAsyncIterOptions): ICancelablePipeable<T> {
  return pipeable(toolboxFrom(source as AsyncIterable<T>, opts));
}

/**
 * Wrap the toolbox concat() with makePipeable to add the pipe method.
 */
export function concat<TSources extends readonly TAnySource<any>[]>(
  ...sources: TSources
): ICancelablePipeable<TElementOf<TSources[number]>>;
export function concat<TSources extends readonly TAnySource<any>[]>(
  ...sourcesAndOptions: [...TSources, IAsyncIterOptions]
): ICancelablePipeable<TElementOf<TSources[number]>>;
export function concat(...sources: unknown[]): ICancelablePipeable<unknown> {
  return pipeable(toolboxConcat<TAnySource<unknown>[]>(...(sources as TAnySource<unknown>[])));
}

/**
 * Wrap the toolbox zip() with makePipeable to add the pipe method.
 */
export function zip<TSources extends readonly TAnySource<any>[]>(
  ...sources: TSources
): ICancelablePipeable<{ -readonly [K in keyof TSources]: TElementOf<TSources[K]> }>;
export function zip<TSources extends readonly TAnySource<any>[]>(
  ...sourcesAndOptions: [...TSources, IAsyncIterOptions]
): ICancelablePipeable<{ -readonly [K in keyof TSources]: TElementOf<TSources[K]> }>;
export function zip(...sources: unknown[]): ICancelablePipeable<unknown[]> {
  return pipeable(toolboxZip<TAnySource<unknown>[]>(...(sources as TAnySource<unknown>[])));
}

/**
 * Wrap the toolbox zipKeyed() with makePipeable to add the pipe method.
 */
export function zipKeyed<T extends Record<string, TAnySource<any>>>(
  shape: T,
  opts?: IAsyncIterOptions,
): ICancelablePipeable<{ [K in keyof T]: TElementOf<T[K]> }> {
  return pipeable(toolboxZipKeyed(shape, opts));
}
