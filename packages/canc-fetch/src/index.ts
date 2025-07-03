import { cancelableFetchFactory, CancelableFetchConfig } from './base';


// Default entry: globals (`fetch`, `AbortController`, `Event`) are captured lazily on first call
// inside the factory, so importing this module is safe even where they are absent.
const cancelableFetch = cancelableFetchFactory();

export default cancelableFetch;

export { cancelableFetch, cancelableFetchFactory };
export type { CancelableFetchConfig };
