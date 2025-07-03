import { CancelablePromise } from './cancelable-promise';

/**
 * A promise implementation that ecosystem utilities (toolbox, lazy-promise, coroutine) can be
 * pointed at. Typed as `PromiseConstructor` because most consumers only need the standard
 * static/instance surface. Consumers that require canc-specific behavior narrow to
 * `typeof CancelablePromise` at their own call sites.
 */
export type PromiseImpl = PromiseConstructor;

/**
 * Options carrying an explicit per-call implementation override, mixed into a consumer's own
 * options object.
 */
export interface IPromiseImplOptions {
	impl?: PromiseImpl;
}

// Module-scoped mutable registry. This state MUST live in the published @cancjs/promise package
// only: eco packages declare @cancjs/promise as a peerDependency so the package manager dedupes it
// to a single installed copy, which keeps this variable a single app-wide slot. Placing it in an
// inlined/relatively-imported shared module would bundle a separate copy into every dependent
// package, splitting the registry across packages.
let registeredImpl: PromiseImpl | undefined;

/**
 * Register the promise implementation ecosystem utilities should use by default. Pass nothing (or
 * `undefined`) to clear the registration and fall back to the built-in CancelablePromise.
 *
 * This is the lowest-precedence injection layer. A per-call `options.impl` or a consumer's class
 * static override both win over it. Register once during app startup.
 *
 * Two copies of @cancjs/promise in one dependency tree each carry their own registry, so a
 * registration made through one copy is invisible to the other. See the package README
 * troubleshooting note. Explicit per-call/static injection is immune to this because it passes the
 * implementation by reference.
 */
export function setPromiseImpl(impl?: PromiseImpl): void {
	registeredImpl = impl;
}

/**
 * The currently registered implementation, or the built-in CancelablePromise when none is
 * registered.
 */
export function getPromiseImpl(): PromiseImpl {
	return registeredImpl || (CancelablePromise as unknown as PromiseImpl);
}

/**
 * Resolve which implementation to use for a single call, applying the layered precedence:
 * per-call `options.impl` first, then a consumer's class static, then the registry, then the
 * built-in CancelablePromise. Consumers pass their own resolved static (or `undefined`) as the
 * second argument.
 */
export function resolvePromiseImpl(options?: IPromiseImplOptions, staticImpl?: PromiseImpl): PromiseImpl {
	return options?.impl || staticImpl || getPromiseImpl();
}
