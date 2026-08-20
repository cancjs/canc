import { IAbortSignalOptions, IPromiseKind, IToolboxDeps, TPromiseCtor, withAbortSignal } from '../../_toolbox';
import { TimeoutError } from '../../_util';

// Captured once at module load per the native-Promise capture invariant; never re-read the
// global afterward.
const NativePromise = Promise;

/**
 * Options every helper in this package accepts. The native Promise constructor ignores its second
 * argument, so `signal` (honored by the `withAbortSignal` wrapper) and `lazy` are the only two that
 * do anything, and naming them is what turns a misspelled option into a compile error.
 */
export interface INativeOptions extends IAbortSignalOptions {
  /**
   * Defer starting the work (the timer, the retry attempt, the poll, the callback invocation...)
   * until the first `then`/`catch`/`finally`/`await`. Not contagious past a chained `.then`.
   */
  lazy?: boolean;
}

/**
 * The promise flavor every helper in this package is bound to. Naming it once here is what gives
 * each helper a plain `Promise<T>` return type without a cast per helper.
 */
export interface INativeKind extends IPromiseKind {
  promise: Promise<this['value']>;
  options: INativeOptions;
}

/**
 * The one dependency bag this package binds the shared factories with, built once at module load.
 *
 * The cast is the single place stating that the native Promise satisfies the minimal constructor
 * shape the factories need; TypeScript cannot see that across the package boundary on its own.
 *
 * `Impl` is wrapped through `withAbortSignal` so every helper honors an `options.signal`: the
 * native `Promise` constructor otherwise ignores that option entirely, which would make
 * `delay(1000, { signal })` type-check, do nothing, and give the caller no way to tell. With no
 * signal passed, the wrapper is a pure passthrough to the native constructor.
 */
export const deps: IToolboxDeps<INativeKind> = {
  Impl: withAbortSignal(NativePromise as unknown as TPromiseCtor),
  TimeoutError,
};
