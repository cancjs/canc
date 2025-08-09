import { CancelablePromise, PromiseImpl } from '@cancjs/promise';
import { lazy, nativeLazy } from '@cancjs/lazy-promise';
import { IToolboxOptions, THandleCancel, construct, resolveImpl } from './options';
import { makeCancelSignal, TGetSignal } from './signal-thread';

/** The registered promisify.custom symbol, referenced via Symbol.for to avoid importing node:util. */
const kCustom = Symbol.for('nodejs.util.promisify.custom');

/** A callback-style function whose last argument is a node-style callback. */
export type TCallbackFn = (...args: any[]) => any;

export interface IPromisifyOptions extends IToolboxOptions {
	/** Node errfirst callback (default true) vs a value-first callback. */
	errorFirst?: boolean;
	/**
	 * Resolve more than the single callback value. `true` resolves the array of post-error callback
	 * arguments; a string[] resolves an object keyed by those names (node's argumentNames parity).
	 */
	multiArgs?: boolean | string[];
	/** Honor a function's Symbol.for('nodejs.util.promisify.custom') implementation. Default true. */
	custom?: boolean;
	/**
	 * Invoke-time hook: normalize the call args and/or place the outbound cancel signal for
	 * signal-aware callback APIs. `getSignal()` materializes the signal on first call (undefined on a
	 * native / non-cancelable implementation); a hook that never calls it allocates no controller.
	 */
	transformArgs?: (args: any[], getSignal: TGetSignal) => any[];
	/**
	 * Cancel-time teardown hook. `handle` is the synchronous return value of the underlying call
	 * (e.g. a ClientRequest or ChildProcess), so the hook can stop the work imperatively.
	 * `getSignal()` returns the outbound signal if one was materialized (undefined otherwise).
	 */
	handleCancel?: (handle: any, args: any[], getSignal: TGetSignal, reason?: any) => void;
	/** Return a LazyPromise: the underlying call is deferred until the first await. Default false. */
	lazy?: boolean;
	/** AbortController implementation used to mint the outbound signal. Defaults to the ambient global. */
	AbortController?: new () => { abort(reason?: any): void; signal: any };
}

/** Resolve the callback result into the resolved value per errorFirst / multiArgs. */
function settleFromCallback(
	cbArgs: any[],
	errorFirst: boolean,
	multiArgs: boolean | string[] | undefined,
	resolve: (value: any) => void,
	reject: (reason?: any) => void,
): void {
	if (errorFirst) {
		const err = cbArgs[0];
		if (err) {
			reject(err);
			return;
		}
		const values = cbArgs.slice(1);
		resolve(mapValues(values, multiArgs));
		return;
	}

	// Value-first: no error slot, every arg is a value.
	resolve(mapValues(cbArgs, multiArgs));
}

/** Collapse the post-error callback values per the multiArgs option. */
function mapValues(values: any[], multiArgs: boolean | string[] | undefined): any {
	if (Array.isArray(multiArgs)) {
		const out: Record<string, any> = {};
		for (let i = 0; i < multiArgs.length; i++) {
			out[multiArgs[i]] = values[i];
		}
		return out;
	}

	if (multiArgs) {
		return values;
	}

	return values[0];
}

/**
 * Turn an errfirst (or value-first) callback function into one returning a CancelablePromise.
 * `boundImpl` fixes the promise implementation (the native twin binds Promise); the unbound factory
 * resolves the implementation per call through the registry.
 */
export function promisifyFactory(boundImpl?: PromiseImpl) {
	return function promisify(fn: TCallbackFn, options?: IPromisifyOptions): (...args: any[]) => CancelablePromise<any> {
		const errorFirst = options?.errorFirst !== false;
		const multiArgs = options?.multiArgs;
		const useCustom = options?.custom !== false;
		const transformArgs = options?.transformArgs;
		const onCancelHook = options?.handleCancel;
		const AbortControllerCtor = options?.AbortController;

		const custom: TCallbackFn | undefined = useCustom && typeof (fn as any)[kCustom] === 'function' ? (fn as any)[kCustom] : undefined;

		return function (this: any, ...callArgs: any[]): CancelablePromise<any> {
			const thisArg = this;
			const Impl = resolveImpl(options, boundImpl);

			const run = (
				resolve: (value: any) => void,
				reject: (reason?: any) => void,
				handleCancel?: THandleCancel,
			) => {
				// Custom impl short-circuits the callback path entirely: call it and adopt its promise.
				if (custom) {
					Impl.resolve(custom.apply(thisArg, callArgs)).then(resolve, reject);
					return;
				}

				const holder = makeCancelSignal(handleCancel, AbortControllerCtor);
				const getSignal = holder.getSignal;

				let args = callArgs;
				if (transformArgs) {
					args = transformArgs(callArgs.slice(), getSignal);
				}

				// Short-circuit guard: once cancel settles the promise, a late callback is a no-op.
				let settled = false;

				const callback = (...cbArgs: any[]) => {
					if (settled) {
						return;
					}
					settled = true;
					settleFromCallback(cbArgs, errorFirst, multiArgs, resolve, reject);
				};

				const handle = fn.apply(thisArg, args.concat([callback]));

				if (typeof handleCancel === 'function') {
					(handleCancel as unknown as (onCancel: (reason?: any) => void) => void)((reason?: any) => {
						settled = true;
						if (onCancelHook) {
							onCancelHook(handle, args, getSignal, reason);
						}
					});
				}
			};

			if (options?.lazy) {
				const makeLazy = Impl === (Promise as unknown as PromiseImpl) ? nativeLazy : lazy;

				return makeLazy(run, options) as unknown as CancelablePromise<any>;
			}

			return construct<any>(Impl, run, options) as CancelablePromise<any>;
		};
	};
}

export const promisify = promisifyFactory();

const DEFAULT_EXCLUDE = [/.+(?:Sync|Stream)$/];

export interface IPromisifyAllOptions extends IPromisifyOptions {
	/** Method names to include (string or RegExp match). When absent, all own function props qualify. */
	include?: (string | RegExp)[];
	/** Method names to exclude. Defaults to names ending in Sync or Stream. */
	exclude?: (string | RegExp)[];
	/** Skip the object itself when it is callable (a module that is also a function). */
	excludeMain?: boolean;
	/** clone: new object, promisified only. merge: write onto source, keep originals. overwrite: replace in place. */
	mode?: 'clone' | 'merge' | 'overwrite';
	/** General name transform for the promisified method (wins over suffix). */
	transformName?: (name: string) => string;
	/** Sugar for a name transform of `n => n + suffix`. */
	suffix?: string;
}

function nameMatches(name: string, patterns: (string | RegExp)[]): boolean {
	for (const pattern of patterns) {
		if (typeof pattern === 'string' ? pattern === name : pattern.test(name)) {
			return true;
		}
	}
	return false;
}

// Per-source-fn cache of the wrapped promisified fn, so shared method refs are wrapped once.
const wrappedCache = new WeakMap<TCallbackFn, (...args: any[]) => CancelablePromise<any>>();

/**
 * Batch-promisify the methods of an object. See IPromisifyAllOptions for selection, naming, and the
 * clone/merge/overwrite modes.
 */
export function promisifyAllFactory(boundImpl?: PromiseImpl) {
	const promisify = promisifyFactory(boundImpl);

	return function promisifyAll<T extends object>(source: T, options?: IPromisifyAllOptions): any {
		const mode = options?.mode || 'clone';
		const include = options?.include;
		const exclude = options?.exclude || DEFAULT_EXCLUDE;

		const transformName = options?.transformName || (options?.suffix ? (n: string) => n + options.suffix : undefined);

		// merge/overwrite without a name change would clobber the original method.
		if ((mode === 'merge' || mode === 'overwrite') && !transformName) {
			throw new Error('promisifyAll merge/overwrite requires transformName or suffix to avoid clobbering the original methods');
		}

		const target: any = mode === 'clone' ? {} : source;

		for (const key of Object.keys(source)) {
			if (options?.excludeMain && key === 'main') {
				continue;
			}

			const value = (source as any)[key];
			if (typeof value !== 'function') {
				continue;
			}

			if (include ? !nameMatches(key, include) : nameMatches(key, exclude)) {
				continue;
			}

			let wrapped = wrappedCache.get(value);
			if (!wrapped) {
				wrapped = promisify(value, options);
				wrappedCache.set(value, wrapped);
			}

			const outName = transformName ? transformName(key) : key;
			target[outName] = wrapped;
		}

		return target;
	};
}

export const promisifyAll = promisifyAllFactory();
