import {
  createCatchErrorFactory,
  createSuppressErrorFactory,
  ICatchErrorFnOf,
  isAbortLike,
  isTimeoutLike,
  ISuppressErrorFnOf,
} from '../../_toolbox';
import {
  AbortError,
  isAbortError,
  isTimeoutError,
  TErrorConstructor,
  TErrorMatcher,
  TErrorPredicate,
  TimeoutError,
} from '../../_util';
import { deps, INativeKind } from './deps';

export type { TErrorConstructor, TErrorMatcher, TErrorPredicate };
export type ICatchErrorFn = ICatchErrorFnOf<INativeKind>;
export type ISuppressErrorFn = ISuppressErrorFnOf<INativeKind>;

export { AbortError, isAbortError, isTimeoutError, TimeoutError };
export const createCatchError: (...matchers: TErrorMatcher[]) => ICatchErrorFn = createCatchErrorFactory(deps);
export const createSuppressError: (...matchers: TErrorMatcher[]) => ISuppressErrorFn = createSuppressErrorFactory(deps);
export const catchAbort: ICatchErrorFn = createCatchError(isAbortLike);
export const suppressAbort: ISuppressErrorFn = createSuppressError(isAbortLike);
export const catchTimeout: ICatchErrorFn = createCatchError(isTimeoutLike);
export const suppressTimeout: ISuppressErrorFn = createSuppressError(isTimeoutLike);
