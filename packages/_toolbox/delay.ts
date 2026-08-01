import { construct, TExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { startTimer, stopTimer } from './timers';

/** Bind `delay` to one promise implementation and set of timers. */
export function delayFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * Resolve after `ms` milliseconds, optionally with a value. When the implementation is
   * cancelable-shaped, canceling the returned promise clears the pending timer so no work leaks; a
   * plain native Promise cannot be canceled and the timer runs to completion.
   */
  return function delay<T = void>(ms: number, value?: T, options?: K['options']): TPromiseOf<K, T> {
    return construct<T, K>(
      deps.Impl,
      (resolve, _reject, ctx?: TExecutorCtx) => {
        const id = startTimer(() => resolve(value as T), ms, deps);

        if (ctx) {
          ctx.handleCancel(() => stopTimer(id, deps));
        }
      },
      options,
    );
  };
}
