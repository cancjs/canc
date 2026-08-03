import {
  cancelableFetchFactory,
  cancelableFetchLaterFactory,
  ICancelableFetchConfig,
  ICancelableFetchLaterConfig,
  IFetchLaterResultLike,
  TCancelableFetchLaterPromise,
  TDeferredRequestInit,
} from './base';

// Default entries: globals (`fetch`, `AbortController`, `fetchLater`) are captured lazily on first
// call inside the factories, so importing this module is safe even where they are absent.
const cancelableFetch = cancelableFetchFactory();
const cancelableFetchLater = cancelableFetchLaterFactory();

export default cancelableFetch;

export { cancelableFetch, cancelableFetchFactory, cancelableFetchLater, cancelableFetchLaterFactory };
export type {
  ICancelableFetchConfig,
  ICancelableFetchLaterConfig,
  IFetchLaterResultLike,
  TCancelableFetchLaterPromise,
  TDeferredRequestInit,
};
