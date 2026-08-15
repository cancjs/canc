import { isFunction, isObjectLike } from '../guards';
import { isPipeOp, isTermOp } from './types';

export type IAsyncIterOptions = object;

export interface ISplitConfigResult<T> {
  config: IAsyncIterOptions;
  rest: T[];
}

export function splitConfig<T extends unknown[]>(args: T): ISplitConfigResult<T[number]> {
  let configIndex = -1;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (
      isObjectLike(arg) &&
      !Array.isArray(arg) &&
      !isFunction(arg) &&
      !isPipeOp(arg) &&
      !isTermOp(arg) &&
      !isIterable(arg)
    ) {
      configIndex = i;
      break;
    }
  }

  if (configIndex === -1) {
    return { config: {}, rest: args as any[] };
  }

  const config = (args[configIndex] || {}) as IAsyncIterOptions;
  const rest = [...args.slice(0, configIndex), ...args.slice(configIndex + 1)] as T[number][];

  return { config, rest };
}

function isIterable(value: unknown): boolean {
  if (!isObjectLike(value)) {
    return false;
  }
  return (
    typeof (value as any)[Symbol.iterator] === 'function' || typeof (value as any)[Symbol.asyncIterator] === 'function'
  );
}
