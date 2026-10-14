import * as nodeStream from 'node:stream';

import { NotImplementedError } from '@cancjs/node';
import { CancelablePromise } from '@cancjs/promise';

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
    return factory();
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

/**
 * Whether the runtime provides native `stream.duplexPair`.
 *
 * Node introduced `duplexPair` in 20.17.0 and 22.6.0 (and it is available on Node >= 23).
 * It is absent on Node 18, 20.0.0-20.16.x, and 22.0.0-22.5.x.
 */
export function checkHasDuplexPair(
  version: string = process.versions.node,
  duplexPairFn: unknown = (nodeStream as { duplexPair?: unknown }).duplexPair,
): boolean {
  if (typeof duplexPairFn !== 'function') {
    return false;
  }
  const parts = version
    .replace(/^v/, '')
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  if (major > 22) {
    return true;
  }
  if (major === 22) {
    return minor >= 6;
  }
  if (major === 20) {
    return minor >= 17;
  }
  return false;
}

export const hasDuplexPair = checkHasDuplexPair();
