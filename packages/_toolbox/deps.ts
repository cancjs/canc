import { TPromiseCtor } from './construct';
import { IPromiseKind, IPromiseLikeKind } from './kind';
import { ITimers } from './timers';

/** Structural AbortController, so no dependency on the ambient DOM/Node type in envs that polyfill it. */
export type TAbortControllerCtor = new () => { abort(reason?: any): void; signal: any };

/**
 * The single bag of dependencies every toolbox factory takes. A package builds one at module load
 * and hands the same object to each factory, so a bound helper's signature is the algorithm's own
 * signature and there is nothing left to keep in sync by hand.
 *
 * The timer functions are optional: leaving them out schedules against the ambient `setTimeout`,
 * which is what a consumer wants until it needs to escape a fake clock.
 */
export interface IToolboxDeps<K extends IPromiseKind = IPromiseLikeKind> extends Partial<ITimers> {
  /** The promise implementation every product of this factory constructs against. */
  Impl: TPromiseCtor;
  /** AbortController implementation used where an outbound signal is minted. */
  AbortController?: TAbortControllerCtor;
  /**
   * Never read at runtime. Declaring the deps object with a flavor is what gives every helper built
   * from it a precise return and options type, so a package states the flavor once instead of
   * casting each helper's result.
   */
  kind?: K;
}
