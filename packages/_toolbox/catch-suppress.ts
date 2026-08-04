import { isAbortError, isTimeoutError } from '../_util';
import { compileErrorMatchers, TErrorMatcher } from '../_util/error-matchers';
import { construct, IExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { isCancelableLike, isCancelErrorLike, isObjectLike, isThenableLike } from './guards';
import { IPromiseKind, IPromiseLikeKind } from './kind';

function causeNameIs(value: unknown, name: string): boolean {
  const cause = isObjectLike(value) ? (value as { cause?: unknown }).cause : undefined;

  return isObjectLike(cause) && (cause as { name?: unknown }).name === name;
}

export const isAbortLike = (reason: unknown): boolean =>
  isAbortError(reason) || (isCancelErrorLike(reason) && causeNameIs(reason, 'AbortError'));

export const isTimeoutLike = (reason: unknown): boolean =>
  isTimeoutError(reason) || (isCancelErrorLike(reason) && causeNameIs(reason, 'TimeoutError'));

function wireCancelInput(ctx: IExecutorCtx | undefined, promise: unknown): void {
  if (!ctx) return;

  ctx.handleCancel(() => {
    if (isCancelableLike(promise)) {
      promise.cancel();
    }
  });
}

export function createCatchErrorFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  return function createCatchError(...matchers: TErrorMatcher[]) {
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
    };
  };
}

export function createSuppressErrorFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  return function createSuppressError(...matchers: TErrorMatcher[]) {
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
    };
  };
}
