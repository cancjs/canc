import { isIterable, isObjectLike, isThenableLike } from '../guards';

export type IAsyncIterOptions = object;

export interface ISplitConfigResult<T> {
  config: IAsyncIterOptions;
  rest: T[];
}

// a prototype without a prototype is some realm's Object.prototype
function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (!isObjectLike(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

/**
 * Split a trailing config object off an argument list. Only the LAST argument can be config, and
 * only a plain object: anything iterable, thenable or class-made stays a source or an operator.
 */
export function splitConfig<T extends unknown[]>(args: T): ISplitConfigResult<T[number]> {
  const last = args[args.length - 1];

  if (args.length > 0 && isPlainObject(last) && !isThenableLike(last) && !isIterable(last)) {
    return { config: last, rest: args.slice(0, -1) as T[number][] };
  }

  return { config: {}, rest: args as any[] };
}
