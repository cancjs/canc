import { CancelablePromise, TCancelablePromiseOptions } from '@cancjs/promise';

import { isFunction } from '../../_util';


export type TGeneratorLike<PYield = unknown, PReturn = any, PNext = unknown> = Omit<Generator<PYield, PReturn, PNext>, typeof Symbol.iterator>;

interface IFn extends Function {
	displayName?: string;
}

export interface IGeneratorLikeFn extends IFn {
	new(...args: any[]): TGeneratorLike;
	(...args: any[]): TGeneratorLike;
}

export type TYieldTransformFn<T = CancelablePromise<any>> = (value: any) => T;

export type TCancalableCoroutineOptions = TCancelablePromiseOptions & {
	transformYield?: TYieldTransformFn;
};

export function coroutine(genFn: IGeneratorLikeFn, options: TCancalableCoroutineOptions = {}) {
	if (!isFunction(genFn)) {
		throw new TypeError('Argument is not a function');
	}

	const displayName = genFn.displayName || genFn.name;

	if (displayName) {
		coroutineWrapper.displayName = 'coroutine ' + displayName;
	}

	let transformYield: TYieldTransformFn<any> | void;

	if ('transformYield' in options) {
		transformYield = options.transformYield;
	}

	function coroutineWrapper(this: any, ...args: any[]) {
		const promise = new CancelablePromise((resolve, reject, addOnCancel) => {
			const gen: TGeneratorLike = genFn.apply(this, args);

			addOnCancel(() => {
				if (gen.return != null) {
					gen.return(undefined);
				}
			});

			function onFulfilled(value: any) {
				try {
					step(gen.next(value));
				} catch (err) {
					reject(err);
				}
			}

			function onRejected(value: any) {
				try {
					if (gen.throw != null) {
						step(gen.throw(value));
					}
				} catch (err) {
					reject(err);
				}
			}

			function step(result: IteratorResult<any>) {
				if (result.done) {
					if (!promise.isCanceled) {
						resolve();
					}
				} else {
					const value = transformYield ? transformYield(result.value) : result.value;
					// TODO: chain promise
					CancelablePromise.resolve(value).then(onFulfilled, onRejected);
				}
			}

			step(gen.next());
		});

		return promise;
	}

	return coroutineWrapper;
}
