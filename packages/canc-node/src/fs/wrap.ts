import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import { makeCancelSignal, TGetSignal } from '../../../_toolbox/cancel-signal';
import { promisifyFactory } from '../../../_toolbox/promisify';
import { NotImplementedError } from '../errors/classes';

function toCancelError(reason?: unknown): CancelError {
  if (isCancelError(reason)) return reason;
  if (reason !== null && typeof reason === 'object') return new CancelError(undefined, { cause: reason });
  return new CancelError(reason as string | undefined);
}

export function cancelify<A extends any[], R>(
  fn: (
    ctx: { getSignal: TGetSignal; handleCancel: (cb: (reason?: any) => void) => void },
    ...args: A
  ) => R | PromiseLike<R>,
): (...callArgs: A) => CancelablePromise<R> {
  return function (...callArgs: A): CancelablePromise<R> {
    return new CancelablePromise<R>((resolve, reject, ctx) => {
      const holder = makeCancelSignal(ctx.handleCancel, undefined, toCancelError);
      const innerCtx = { getSignal: holder.getSignal, handleCancel: ctx.handleCancel! };

      void CancelablePromise.resolve(fn(innerCtx, ...callArgs)).then(resolve, reject);
    });
  };
}

const deps = {
  Impl: CancelablePromise,
  AbortController: typeof AbortController !== 'undefined' ? AbortController : (undefined as any),
};
export const promisifyWrapped = promisifyFactory(deps);

export function withSignal(opts: any, signal: any): any {
  if (opts !== null && typeof opts === 'object') return { ...opts, signal };
  if (typeof opts === 'string') return { encoding: opts, signal };
  return { signal };
}

export function signalWrapped(
  fn: (...args: any[]) => any,
  entry: any,
  runningMajor = parseInt(process.versions.node.split('.')[0], 10),
) {
  const acceptsSignal = !!entry?.nodeSignal?.sinceByMajor?.[runningMajor];
  return cancelify((ctx, ...args: any[]) => {
    if (!acceptsSignal) return fn(...args);
    const signal = ctx.getSignal();
    if (!signal) return fn(...args);

    const newArgs = args.slice();
    const lastArg = newArgs.length > 0 ? newArgs[newArgs.length - 1] : undefined;

    if (
      newArgs.length === 0 ||
      (typeof lastArg !== 'string' && typeof lastArg !== 'object' && lastArg !== undefined && lastArg !== null)
    ) {
      newArgs.push({ signal });
    } else {
      newArgs[newArgs.length - 1] = withSignal(lastArg, signal);
    }

    return fn(...newArgs);
  });
}

export function teardownWrapped(fn: (...args: any[]) => any, teardownFn: (val: any, args: any[]) => void) {
  return cancelify((ctx, ...args: any[]) => {
    const p = fn(...args);
    ctx.handleCancel(() => {
      Promise.resolve(p).then(
        (val) => {
          try {
            teardownFn(val, args);
          } catch (_e) {
            // ignore
          }
        },
        () => {},
      );
    });
    return p;
  });
}

export function gatedWrapped(isAvailable: boolean, name: string, version: string, wrappedFn: (...args: any[]) => any) {
  return function (...args: any[]) {
    if (!isAvailable) {
      throw new NotImplementedError(`Feature ${name} is not implemented`, { feature: name, required: version });
    }
    return wrappedFn(...args);
  };
}
