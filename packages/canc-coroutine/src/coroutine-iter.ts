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

type TAsyncGeneratorStep = {
	method: TGeneratorMethod;
	value: any;
	resolve: TResolveRejectFn;
	reject: TResolveRejectFn;
	next: TAsyncGeneratorStep | null;
};

const genMethods = ['next', 'throw', 'return'] as const;

const awaitedSymbol = Symbol.for('coroutineIter awaited value');

type TAwaited<T = any> = { [awaitedSymbol]: T };

const isAwaited = (value: any): value is TAwaited => isObject(value) && awaitedSymbol in value;

export const awaited = <T = any>(value: T | TAwaited<T>): TAwaited<T> => ({ [awaitedSymbol]: isAwaited(value) ? value[awaitedSymbol] : value });

export function coroutineIter(genFn: IGeneratorLikeFn, options: TCancalableCoroutineOptions = {}) {
	if (!isFunction(genFn)) {
		throw new TypeError('Argument is not a function');
	}

	const displayName = genFn.displayName || genFn.name;

	if (displayName) {
		coroutineIterWrapper.displayName = 'coroutineIter ' + displayName;
	}

	const { transformYield, ...promiseOptions } = options;

	function coroutineIterWrapper(this: any, ...args: any[]) {
		const gen: TGeneratorLike = genFn.apply(this, args);

		let currentStep: TAsyncGeneratorStep | null;
		let queuedStep: TAsyncGeneratorStep | null;

		const asyncGen = {
			[Symbol.asyncIterator]() {
				return this;
			}
		} as AsyncGenerator;

		for (const method of genMethods) {
			asyncGen[method] = (value: any): CancelablePromise<any> => {
				return new CancelablePromise(
					(resolve, reject) => {
						const step: TAsyncGeneratorStep = {
							method,
							value,
							resolve,
							reject,
							next: null
						};

						if (queuedStep) {
							queuedStep.next = step;
							queuedStep = step;
						} else {
							queuedStep = step;
							currentStep = step;

							resume(method, value);
						}
					},
					promiseOptions
				);
			};
		}

		function resume(method: TGeneratorMethod, sentValue: any) {
			try {
				const result = gen[method](sentValue);
				const value = transformYield ? transformYield(result.value) : result.value;
				const isAwaitedValue = isAwaited(value);

				CancelablePromise.resolve(isAwaitedValue ? value[awaitedSymbol] : value).then(
					(value) => {
						if (isAwaitedValue) {
							resume(method === 'throw' ? 'next' : method, value);
						} else {
							settle(result.done ? 'return' : 'next', value);
						}
					},
					(error) => {
						resume('throw', error);
					}
				);
			} catch (error) {
				settle('throw', error);
			}
		}

		function settle(type: TGeneratorMethod, value: any) {
			if (type === 'return') {
				currentStep!.resolve({ value, done: true });
			} else if (type === 'throw') {
				currentStep!.reject(value);
			} else if (type === 'next') {
				currentStep!.resolve({ value, done: false });
			}

			currentStep = currentStep!.next;

			if (currentStep) {
				resume(currentStep.method, currentStep.value);
			} else if (queuedStep) {
				queuedStep = null;
			}
		}

		return asyncGen;
	}

	return coroutineIterWrapper;
}

