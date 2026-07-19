import { LazyBase, TLazyExecutor, TPromiseCtor } from '../../_lazy';

export type { TLazyExecutor } from '../../_lazy';

/**
 * Reserved for parity with `@cancjs/lazy-promise`'s options bag. The native lazy promise takes no
 * options today; this type exists so call sites can be written generically across both packages.
 */
export type ILazyPromiseOptions = Record<string, never>;

// Captured once at module load per the native-Promise capture invariant; never re-read the
// global afterward.
const NativePromise = Promise;

/**
 * A lazily-evaluated promise-like backed by the native `Promise`. The executor is deferred until
 * the first `then`/`catch`/`finally` (or `await`). The result is cached: multiple subscribers
 * share a single execution. There is no cancellation surface; use `@cancjs/lazy-promise` for a
 * cancelable lazy.
 */
export class LazyPromise<T = any> extends LazyBase<T> {
	protected _resolveImpl(): TPromiseCtor {
		return NativePromise as unknown as TPromiseCtor;
	}
}

/**
 * Create a lazy promise from an executor. The executor does not run until the returned value is
 * first subscribed (`then`/`catch`/`finally`/`await`).
 */
export function lazy<T = any>(executor: TLazyExecutor<T>): LazyPromise<T> {
	return new LazyPromise<T>(executor);
}
