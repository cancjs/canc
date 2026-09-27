import { TimeoutError } from '../_util';
import { TPromiseCtor } from './construct';
import { IPromiseKind, IPromiseLikeKind } from './kind';
import { TTimersOverride } from './timers';

/** Structural AbortController, so no dependency on the ambient DOM/Node type in envs that polyfill it. */
export type TAbortControllerCtor = new () => { abort(reason?: any): void; signal: any };

/**
 * The single bag of dependencies every toolbox factory takes. A package builds one at module load
 * and hands the same object to each factory, so a bound helper's signature is the algorithm's own
 * signature and there is nothing left to keep in sync by hand.
 *
 * The timer functions are optional, and go in as a whole pair or not at all: leaving them out
 * schedules against the ambient `setTimeout`, which is what a consumer wants until it needs to
 * escape a fake clock.
 */
export type IToolboxDeps<K extends IPromiseKind = IPromiseLikeKind> = TTimersOverride & {
  /** The promise implementation every product of this factory constructs against. */
  Impl: TPromiseCtor;
  /** AbortController implementation used where an outbound signal is minted. */
  AbortController?: TAbortControllerCtor;
  /**
   * The TimeoutError constructor products of this factory reject with. Supplied by the package so
   * the class a consumer imports and the class a helper throws are the same object, which is what
   * keeps `instanceof` usable for callers. Defaults to the inlined shared class when omitted.
   */
  TimeoutError?: typeof TimeoutError;
  /**
   * Whether `Impl` products are cancelable-shaped (expose `cancel` and pass a `handleCancel`-bearing
   * ctx into the executor). Read only by the `{ lazy: true }` construction path (`./construct-timed`) to decide
   * whether a deferred wrapper exposes a working `cancel`; every other factory already feature-detects
   * cancelability per call through the executor's own `ctx` argument and ignores this flag.
   */
  cancelable?: boolean;
  /**
   * Never read at runtime. Declaring the deps object with a flavor is what gives every helper built
   * from it a precise return and options type, so a package states the flavor once instead of
   * casting each helper's result.
   */
  kind?: K;
};

/**
 * The dependencies a single call may override, under the same names as the factory bag so that one
 * rule covers both: a call's value wins over the factory's, and the ambient one is the last resort.
 * Timers resolve as a pair through `resolveTimers`; the standalone members resolve on their own.
 *
 * `Impl` and `kind` are deliberately absent. Both decide the TYPE of what a helper returns, which a
 * per-call argument cannot change, so accepting them here would be a promise the signature could
 * not keep. They are the one documented exception to every dependency being overridable per call.
 */
export type TCallDeps = TTimersOverride & {
  /** AbortController implementation used where an outbound signal is minted. */
  AbortController?: TAbortControllerCtor;
  /** The TimeoutError constructor this call rejects with when a deadline is missed. */
  TimeoutError?: typeof TimeoutError;
};
