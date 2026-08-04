import { createCatchErrorFactory, createSuppressErrorFactory, isAbortLike, isTimeoutLike } from '../../_toolbox';
import {
  AbortError,
  isAbortError,
  isTimeoutError,
  TErrorConstructor,
  TErrorMatcher,
  TErrorPredicate,
  TimeoutError,
} from '../../_util';
import { deps } from './deps';

export type { TErrorConstructor, TErrorMatcher, TErrorPredicate };
export { AbortError, isAbortError, isTimeoutError, TimeoutError };
export const createCatchError = createCatchErrorFactory(deps);
export const createSuppressError = createSuppressErrorFactory(deps);
export const catchAbort = createCatchError(isAbortLike);
export const suppressAbort = createSuppressError(isAbortLike);
export const catchTimeout = createCatchError(isTimeoutLike);
export const suppressTimeout = createSuppressError(isTimeoutLike);
