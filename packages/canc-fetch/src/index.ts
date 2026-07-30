import {
  CancelableFetchConfig,
  cancelableFetchFactory,
  CancelableFetchLaterConfig,
  cancelableFetchLaterFactory,
  CancelableFetchLaterPromise,
  DeferredRequestInit,
  FetchLaterResultLike,
} from './base';

// Default entries: globals (`fetch`, `AbortController`, `fetchLater`) are captured lazily on first
// call inside the factories, so importing this module is safe even where they are absent.
const cancelableFetch = cancelableFetchFactory();
const cancelableFetchLater = cancelableFetchLaterFactory();

export default cancelableFetch;

export { cancelableFetch, cancelableFetchFactory, cancelableFetchLater, cancelableFetchLaterFactory };
export type {
  CancelableFetchConfig,
  CancelableFetchLaterConfig,
  CancelableFetchLaterPromise,
  DeferredRequestInit,
  FetchLaterResultLike,
};
