import type { AnyIterable } from '../../../_toolbox/async-iter';
import { makePipeable } from '../../../_toolbox/async-iter/pipe';
import {
  concat as toolboxConcat,
  from as toolboxFrom,
  zip as toolboxZip,
  zipKeyed as toolboxZipKeyed,
} from '../../../_toolbox/async-iter/sources';

/**
 * Wrap the toolbox from() with makePipeable to add the pipe method.
 */
export function from<T>(source: AnyIterable<T> | PromiseLike<T>, opts?: any) {
  return makePipeable(toolboxFrom(source, opts));
}

/**
 * Wrap the toolbox concat() with makePipeable to add the pipe method.
 */
export function concat<T>(...args: any[]) {
  return makePipeable(toolboxConcat<T>(...args));
}

/**
 * Wrap the toolbox zip() with makePipeable to add the pipe method.
 */
export function zip<T extends readonly any[]>(...args: any[]) {
  return makePipeable(toolboxZip<T>(...args));
}

/**
 * Wrap the toolbox zipKeyed() with makePipeable to add the pipe method.
 */
export function zipKeyed<T extends Record<string, AnyIterable<any>>>(shape: T, opts?: any) {
  return makePipeable(toolboxZipKeyed(shape, opts));
}
