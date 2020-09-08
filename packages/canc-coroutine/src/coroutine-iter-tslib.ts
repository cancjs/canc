import { CancelablePromise, TCancelablePromiseOptions } from '@cancjs/promise';

import { isFunction, isObject } from '../../_util';


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

type TGeneratorMethod = typeof genMethods[number];

type TResolveRejectFn = (value?: any) => void;

type TAsyncGeneratorTurn = {
	method: TGeneratorMethod;
	value: any;
	resolve: TResolveRejectFn;
	reject: TResolveRejectFn;
};

const awaitableSymbol = Symbol.for('async iterator awaitable');

type TAwaitable<T = any> = { [awaitableSymbol]: T };

const isAwaitable = (value: any): value is TAwaitable => isObject(value) && awaitableSymbol in value;

const awaitable = <T = any>(value: T | TAwaitable<T>): TAwaitable<T> => ({ [awaitableSymbol]: isAwaitable(value) ? value[awaitableSymbol] : value });

const genMethods = ['next', 'throw', 'return'] as const;

export function coroutineIter(genFn: IGeneratorLikeFn, options: TCancalableCoroutineOptions = {}) {
	if (!isFunction(genFn)) {
		throw new TypeError('Argument is not a function');
	}

	const displayName = genFn.displayName || genFn.name;

	if (displayName) {
		coroutineIterWrapper.displayName = 'coroutineIter ' + displayName;
	}

	let transformYield: TYieldTransformFn<any> | void;

	if ('transformYield' in options) {
		transformYield = options.transformYield;
	}

	function coroutineIterWrapper(this: any, ...args: any[]) {
		const gen: TGeneratorLike = genFn.apply(this, args);
		const turns: TAsyncGeneratorTurn[] = [];
		const asyncGen = {
			[Symbol.asyncIterator]() {
				return this;
			}
		} as AsyncGenerator;

		genMethods.forEach(method => {
			if (gen[method] != null) {
				asyncGen[method] = (value: any) => {
					return new Promise<any>((resolve, reject) => {
						turns.push({ method, value, resolve, reject });

						if (turns.length === 1) {
							resume(method, value);
						}
					});
				};
			}
		});

		return asyncGen;

		function onFulfilled(value: any) {
			resume('next', value);
		}

		function onRejected(value: any) {
			resume('throw', value);
		}

		function resume(method: TGeneratorMethod, value: any) {
			try {
				const result = gen[method](value);

				if (isAwaitable(result.value)) {
					Promise.resolve(result.value[awaitableSymbol]).then(onFulfilled, onRejected);
				} else {
					const [{ resolve }] = turns;
					settle(resolve, result);
				}
			} catch (error) {
				const [{ reject }] = turns;
				settle(reject, error);
			}
		}

		function settle(resolveOrReject: TResolveRejectFn, value: any) {
			resolveOrReject(value);
			turns.shift();

			if (turns.length) {
				const [{ method, value }] = turns;
				resume(method, value);
			}
		}
	}

	return coroutineIterWrapper;
}
