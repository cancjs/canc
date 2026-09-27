import { isIterable, isObjectLike, isThenableLike } from '../guards';

export type IAsyncIterOptions = object;

export interface ISplitConfigResult<T> {
  config: IAsyncIterOptions;
  rest: T[];
}

export function splitConfig<T extends unknown[]>(args: T): ISplitConfigResult<T[number]> {
  let configIndex = -1;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (isObjectLike(arg) && !Array.isArray(arg) && !isThenableLike(arg) && !isIterable(arg)) {
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
