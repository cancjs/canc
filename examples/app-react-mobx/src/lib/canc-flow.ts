// cancFlow: a cancelable replacement for mobx `flow`, built on @cancjs/coroutine.
//
// mobx's own `flow` runs a generator and lets you cancel it with `flowResult(run).cancel()`, but
// that cancel only stops the GENERATOR. Any request already in flight when you cancel keeps
// running to completion. cancFlow instead returns a CancelablePromise whose cancel() propagates
// through the coroutine: the pending step is aborted and nothing downstream runs.
//
// The only mobx-specific concern is strict mode. Under `configure({ enforceActions: 'always' })`
// every observable write must happen inside an `action`. mobx's `flow` gets this for free because
// it drives the generator itself and wraps each resume in an action. cancAsync does not know about
// mobx, so this wrapper supplies the same guarantee by proxying the generator object: each
// re-entry (next / throw / return) runs inside a mobx `action` before the value reaches cancAsync's
// driver. User code writes observables freely between yields with no warnings.
//
// This is a small composition over cancAsync with zero core changes. Copy it freely; it is a seed
// for a future @cancjs/mobx package, so it is kept dependency-tidy (only mobx + coroutine).

import { action } from 'mobx';
import { async as cancAsync } from '@cancjs/coroutine';
import type { CancelablePromise, ICancelablePromiseOptions } from '@cancjs/promise';

type GeneratorFn<TThis, TArgs extends any[], TReturn> = (this: TThis, ...args: TArgs) => Generator<any, TReturn, any>;

// Wraps a live generator so every resume (next/throw/return) runs inside a mobx action. Only the
// driver's re-entry points are wrapped, never the user's code between yields.
function actionWrapped<TReturn>(gen: Generator<any, TReturn, any>): Generator<any, TReturn, any> {
 const stepNext = action('cancFlow.next', gen.next.bind(gen));
 const stepThrow = action('cancFlow.throw', gen.throw.bind(gen));
 const stepReturn = action('cancFlow.return', gen.return.bind(gen));
 return {
 next: (value?: any) => stepNext(value),
 throw: (err?: any) => stepThrow(err),
 return: (value?: any) => stepReturn(value),
 [Symbol.iterator]() {
 return this;
 },
 } as unknown as Generator<any, TReturn, any>;
}

/**
 * Turn a generator method into a function returning a CancelablePromise, with every generator
 * re-entry wrapped in a mobx `action` (strict-mode safe). Drop-in for mobx `flow`, minus the
 * shallow cancel: canceling the returned promise aborts the in-flight step too.
 *
 * @param genFn generator function (the flow body)
 * @param ctx `this` for the generator (usually the store instance)
 * @param options forwarded to the underlying CancelablePromise
 */
export function cancFlow<TThis, TArgs extends any[], TReturn>(
 genFn: GeneratorFn<TThis, TArgs, TReturn>,
 ctx?: TThis,
 options?: ICancelablePromiseOptions
): (...args: TArgs) => CancelablePromise<TReturn> {
 const wrappedGenFn = function (this: TThis, ...args: TArgs): Generator<any, TReturn, any> {
 return actionWrapped(genFn.apply(this, args));
 };
 const run = cancAsync(wrappedGenFn as any, ctx, options);
 return run as unknown as (...args: TArgs) => CancelablePromise<TReturn>;
}
