import { CancelablePromise } from '@cancjs/promise';

import { NotImplementedError } from './errors/classes';

export type TGatedKind = 'sync' | 'promise';

/**
 * Return implementation unchanged when available, or a function throwing or rejecting with
 * NotImplementedError.
 */
export function gated<TFn extends (...args: any[]) => any>(
  available: boolean,
  feature: string,
  required: string,
  factory: () => TFn,
  kind: TGatedKind = 'sync',
): TFn {
  if (available) {
    let cached: TFn | undefined;
    return function (this: unknown, ...args: any[]) {
      if (cached === undefined) {
        cached = factory();
      }
      return cached.apply(this, args);
    } as unknown as TFn;
  }

  if (kind === 'promise') {
    return ((..._args: any[]) =>
      CancelablePromise.reject(
        new NotImplementedError(`${feature} requires Node >= ${required}`, { feature, required }),
      )) as unknown as TFn;
  }

  return ((..._args: any[]) => {
    throw new NotImplementedError(`${feature} requires Node >= ${required}`, { feature, required });
  }) as unknown as TFn;
}
