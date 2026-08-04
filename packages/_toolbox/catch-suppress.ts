import { isAbortError, isTimeoutError } from '../_util';
import { compileErrorMatchers, TErrorMatcher } from '../_util/error-matchers';
import { construct, IExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { isCancelableLike, isCancelErrorLike, isObjectLike, isThenableLike } from './guards';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';

function causeNameIs(value: unknown, name: string): boolean {
  const cause = isObjectLike(value) ? (value as { cause?: unknown }).cause : undefined;

  return isObjectLike(cause) && (cause as { name?: unknown }).name === name;
}

/**
 * Whether `reason` is an AbortError (bare, or a CancelError-shaped rejection whose cause is one).
 * Ported from the same predicate core's suppressCancel/catchCancel use (`canc-promise/src/catch-suppress.ts`)
 * so the two families agree on what counts as an abort; the port is deliberate duplication, not an import,
 * because the native toolbox twin built from this module must carry zero runtime dependency on `@cancjs/promise`.
 */
export const isAbortLike = (reason: unknown): boolean =>
  isAbortError(reason) || (isCancelErrorLike(reason) && causeNameIs(reason, 'AbortError'));

/**
 * Whether `reason` is a TimeoutError (bare, or a CancelError-shaped rejection whose cause is one).
 * Ported from the same predicate core's suppressCancel/catchCancel use (`canc-promise/src/catch-suppress.ts`)
 * so the two families agree on what counts as a timeout; the port is deliberate duplication, not an import,
 * because the native toolbox twin built from this module must carry zero runtime dependency on `@cancjs/promise`.
 */
export const isTimeoutLike = (reason: unknown): boolean =>
  isTimeoutError(reason) || (isCancelErrorLike(reason) && causeNameIs(reason, 'TimeoutError'));

function wireCancelInput(ctx: IExecutorCtx | undefined, promise: unknown): void {
  // Inert on the native flavor: a native Promise executor is invoked with no third argument, so
  // ctx is undefined there and this never registers anything - the same degradation every other
  // native-twin toolbox helper already documents. The cancelable flavor propagates an outer
  // cancel down to a cancelable input, same as every other toolbox helper that adopts one.
  if (!ctx) return;

  ctx.handleCancel(() => {
    if (isCancelableLike(promise)) {
      promise.cancel();
    }
  });
}

/**
 * Call signature produced by {@link createSuppressErrorFactory}'s products.
 */
export interface ISuppressErrorFnOf<K extends IPromiseKind> {
  <T>(promise: PromiseLike<T>): TPromiseOf<K, T | void>;
  <TError>(error: TError): void | never;
}

/**
 * Call signature produced by {@link createCatchErrorFactory}'s products.
 */
export interface ICatchErrorFnOf<K extends IPromiseKind> {
  <T>(promise: PromiseLike<T>): TPromiseOf<K, T | Error>;
  <TError>(error: TError): TError | never;
}

/**
 * Create a factory for `createCatchError` bound to a specific Promise implementation.
 * The produced `createCatchError` function compiles error matchers into a helper that converts
 * matched promise rejections into resolved values (the error) or returns raw errors.
 */
export function createCatchErrorFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  return function createCatchError(...matchers: TErrorMatcher[]): ICatchErrorFnOf<K> {
    const isCaught = compileErrorMatchers(matchers, 'createCatchError');

    return function catchError(errorOrPromise: any): any {
      if (isThenableLike(errorOrPromise)) {
        return construct<any, K>(deps.Impl, (resolve, reject, ctx?: IExecutorCtx) => {
          deps.Impl.resolve(errorOrPromise).then(resolve, (reason: any) => {
            if (isCaught(reason)) {
              resolve(reason);
            } else {
              reject(reason);
            }
          });

          wireCancelInput(ctx, errorOrPromise);
        });
      }

      if (isCaught(errorOrPromise)) {
        return errorOrPromise;
      }

      throw errorOrPromise;
    } as ICatchErrorFnOf<K>;
  };
}

/**
 * Create a factory for `createSuppressError` bound to a specific Promise implementation.
 * The produced `createSuppressError` function compiles error matchers into a helper that converts
 * matched promise rejections into resolved `undefined` values or swallows raw errors.
 */
export function createSuppressErrorFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  return function createSuppressError(...matchers: TErrorMatcher[]): ISuppressErrorFnOf<K> {
    const isCaught = compileErrorMatchers(matchers, 'createSuppressError');

    return function suppressError(errorOrPromise: any): any {
      if (isThenableLike(errorOrPromise)) {
        return construct<any, K>(deps.Impl, (resolve, reject, ctx?: IExecutorCtx) => {
          deps.Impl.resolve(errorOrPromise).then(resolve, (reason: any) => {
            if (isCaught(reason)) {
              resolve(undefined);
            } else {
              reject(reason);
            }
          });

          wireCancelInput(ctx, errorOrPromise);
        });
      }

      if (isCaught(errorOrPromise)) {
        return undefined;
      }

      throw errorOrPromise;
    } as ISuppressErrorFnOf<K>;
  };
}
