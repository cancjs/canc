import { construct, TPromiseCtor, THandleCancel } from './construct';

export interface IDebounceOptions {
	leading?: boolean;
	trailing?: boolean;
	maxWait?: number;
	[key: string]: unknown;
}

export interface IDebounced<Args extends unknown[], R> {
	(...args: Args): PromiseLike<R>;
	cancel(): void;
	flush(): PromiseLike<R> | undefined;
	readonly isPending: boolean;
}

export interface IDebounceDeps {
	Impl: TPromiseCtor;
}

interface ICancelableLike {
	then: PromiseLike<any>['then'];
	cancel: (reason?: any) => void;
}

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

function isCancelableLike(value: unknown): value is ICancelableLike {
	return isObject(value) && typeof (value as any).cancel === 'function';
}

export function debounceFactory(deps: IDebounceDeps) {
	return function debounce<Args extends unknown[], R>(
		fn: (...args: Args) => R | PromiseLike<R>,
		ms: number,
		options?: IDebounceOptions,
	): IDebounced<Args, R> {
		var leading = options != null && options.leading === true;
		var trailing = options != null && options.trailing === false ? false : true;
		var maxWait: number | undefined = options != null ? options.maxWait : undefined;

		var timerId: ReturnType<typeof setTimeout> | undefined;
		var maxTimerId: ReturnType<typeof setTimeout> | undefined;
		var lastArgs: Args | undefined;
		var lastCallTime: number | undefined;
		var lastInvokeTime = 0;

		var pendingResolve: ((value: R | PromiseLike<R>) => void) | undefined;
		var pendingReject: ((reason?: any) => void) | undefined;
		var pendingPromise: PromiseLike<R> | undefined;
		var inFlightResult: PromiseLike<R> | undefined;
		var superseding = false;

		function invoke(args: Args): void {
			lastInvokeTime = Date.now();
			lastArgs = undefined;

			var result: R | PromiseLike<R>;
			try {
				result = fn.apply(undefined, args);
			} catch (e) {
				if (pendingReject) {
					pendingReject(e);
					pendingResolve = undefined;
					pendingReject = undefined;
				}
				return;
			}

			inFlightResult = isObject(result) && typeof (result as any).then === 'function'
				? result as PromiseLike<R>
				: undefined;

			if (pendingResolve) {
				pendingResolve(result);
				pendingResolve = undefined;
				pendingReject = undefined;
			}
		}

		function clearTimers(): void {
			if (timerId !== undefined) { clearTimeout(timerId); timerId = undefined; }
			if (maxTimerId !== undefined) { clearTimeout(maxTimerId); maxTimerId = undefined; }
		}

		function cancelPending(): void {
			superseding = true;
			if (pendingPromise && isCancelableLike(pendingPromise)) {
				(pendingPromise as ICancelableLike).cancel();
			}
			superseding = false;
			pendingResolve = undefined;
			pendingReject = undefined;
			pendingPromise = undefined;
		}

		function timerExpired(): void {
			timerId = undefined;
			if (maxTimerId !== undefined) { clearTimeout(maxTimerId); maxTimerId = undefined; }

			if (trailing && lastArgs) {
				invoke(lastArgs);
			} else {
				pendingResolve = undefined;
				pendingReject = undefined;
			}
		}

		function makePromise(): PromiseLike<R> {
			var p = construct<R>(deps.Impl, function (resolve, reject, handleCancel?: THandleCancel) {
				pendingResolve = resolve;
				pendingReject = reject;

				if (typeof handleCancel === 'function') {
					handleCancel(function () {
						if (superseding) return;
						clearTimers();
						lastArgs = undefined;
						pendingResolve = undefined;
						pendingReject = undefined;
						pendingPromise = undefined;
						if (isCancelableLike(inFlightResult)) {
							(inFlightResult as ICancelableLike).cancel();
						}
						inFlightResult = undefined;
					});
				}
			}, options);

			pendingPromise = p;
			return p;
		}

		var wrapped = function () {
			var args = arguments;
			var argsArray: Args = Array.prototype.slice.call(args) as any;
			var now = Date.now();
			var isFirstCall = timerId === undefined && maxTimerId === undefined && !pendingPromise;

			lastArgs = argsArray;
			lastCallTime = now;

			if (timerId !== undefined) {
				clearTimeout(timerId);
				timerId = undefined;
			}

			if (!isFirstCall && pendingPromise && pendingResolve) {
				cancelPending();
			}

			var promise = makePromise();

			if (leading && isFirstCall) {
				invoke(argsArray);
				if (trailing) {
					timerId = setTimeout(timerExpired, ms);
				}
				if (maxWait !== undefined && maxTimerId === undefined) {
					maxTimerId = setTimeout(timerExpired, maxWait);
				}
				return promise;
			}

			timerId = setTimeout(timerExpired, ms);
			if (maxWait !== undefined && maxTimerId === undefined) {
				maxTimerId = setTimeout(timerExpired, maxWait);
			}

			return promise;
		} as unknown as IDebounced<Args, R>;

		(wrapped as any).cancel = function (): void {
			clearTimers();
			lastArgs = undefined;
			if (isCancelableLike(inFlightResult)) {
				(inFlightResult as ICancelableLike).cancel();
			}
			inFlightResult = undefined;
			cancelPending();
		};

		(wrapped as any).flush = function (): PromiseLike<R> | undefined {
			if (timerId === undefined && maxTimerId === undefined) return undefined;

			var args = lastArgs;
			clearTimers();

			if (args) {
				invoke(args);
			}

			var p = pendingPromise;
			return p;
		};

		Object.defineProperty(wrapped, 'isPending', {
			get: function () {
				return timerId !== undefined || maxTimerId !== undefined;
			},
		});

		return wrapped;
	};
}
