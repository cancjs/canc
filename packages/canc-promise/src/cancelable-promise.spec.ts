import * as canc_promise from './index';

describe.skip('', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	it('extends global Promise', () => {
		const NativePromise = Promise;
		// const NativePromiseProxy = new Proxy(NativePromise, {});
		// const nativePromise = new NativePromise<never>((_resolve) => {});
		const nativePromise = NativePromise.resolve();

		const NativePromiseSpy = jest.spyOn(global, 'Promise')
		.mockReturnValue(nativePromise);

	});
});

/* eslint-disable @typescript-eslint/promise-function-async */
describe('Native Promise capture', () => {
	let NativePromise: PromiseConstructor;
	let originalPromiseDescriptor: PropertyDescriptor;
	let CancelablePromise: typeof canc_promise.CancelablePromise;
	let promiseGetterSpy: jest.SpyInstance<PromiseConstructor>;

	beforeAll(() => {
		NativePromise = Promise;
		originalPromiseDescriptor = Object.getOwnPropertyDescriptor(global, 'Promise')!;

		// Make getter restorable with mockRestore
		Object.defineProperty(global, 'Promise', {
			get: () => NativePromise,
			configurable: true
		});
	});

	afterAll(() => {
		Object.defineProperty(global, 'Promise', originalPromiseDescriptor);
	});

	beforeEach(() => {
		jest.resetModules();
		CancelablePromise = require('./cancelable-promise').CancelablePromise;

		promiseGetterSpy = jest.spyOn(global, 'Promise', 'get')
		.mockImplementation(() => {
			throw new Error('Global Promise is accessed after capture');
		});
	});

	afterEach(() => {
		promiseGetterSpy.mockRestore();
		expect(promiseGetterSpy).not.toHaveBeenCalled();
	});

	it('constructs fulfilled promise', (): any => {
		// expect(true).toBe(true);
		//
		// return;
		let cancelablePromise = new CancelablePromise(
			resolve => resolve('resolved')
		);

		return NativePromise.resolve(cancelablePromise)
		.then(value => {
			expect(value).toBe('resolved');
		});
	});

	it('constructs rejected promise', () => {
		let cancelablePromise = new CancelablePromise(
			(_resolve, reject) => reject('rejected')
		);

		return NativePromise.resolve(cancelablePromise)
		.then(
			() => {
				throw new Error('Not rejected');
			},
			reason => {
				expect(reason).toBe('rejected');
			}
		);
	});

	it('constructs canceled promise', () => {
		let cancelablePromise = new CancelablePromise(() => {/**/});

		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		cancelablePromise.cancel('canceled');

		return NativePromise.resolve(cancelablePromise)
		.then(
			() => {
				throw new Error('Not rejected');
			},
			reason => {
				expect(reason).toEqual(expect.any(Error));
				expect(reason.name).toBe('CancelError');
				expect(reason.message).toBe('canceled');
			}
		);
	});

	it('fulfills with .resolve()', () => {
		let cancelablePromise = CancelablePromise.resolve('resolved');

		return NativePromise.resolve(cancelablePromise)
		.then(value => {
			expect(value).toBe('resolved');
		});
	});

	it('rejects with .resolve()', () => {
		let cancelablePromise = CancelablePromise.resolve(
			new CancelablePromise(
				(_resolve, reject) => reject('rejected')
			)
		);

		return NativePromise.resolve(cancelablePromise)
		.then(
			() => {
				throw new Error('Not rejected');
			},
			reason => {
				expect(reason).toBe('rejected');
			}
		);
	});


	it('rejects with .reject()', () => {
		let cancelablePromise = CancelablePromise.reject('rejected');

		return NativePromise.resolve(cancelablePromise)
		.then(
			() => {
				throw new Error('Not rejected');
			},
			reason => {
				expect(reason).toBe('rejected');
			}
		);
	});

	it('fulfills with .all()', () => {
		const value1 = new NativePromise(resolve => setTimeout(() => resolve(1), 10));
		const value2 = new CancelablePromise(resolve => setTimeout(() => resolve(2), 20));
		const value3 = NativePromise.resolve(3);
		const value4 = 4;

		let cancelablePromise = CancelablePromise.all([value1, value2, value3, value4]);

		return NativePromise.resolve(cancelablePromise)
		.then(value => {
			expect(value).toEqual([1, 2, 3, 4]);
		});
	});

	it('rejects with .all()', () => {
		const value1 = new NativePromise(resolve => setTimeout(() => resolve(1), 10));
		const value2 = new CancelablePromise((_resolve, reject) => setTimeout(() => reject(2), 10));
		const value3 = CancelablePromise.reject(3);
		const value4 = 4;

		let cancelablePromise = CancelablePromise.all([value1, value2, value3, value4]);

		return NativePromise.resolve(cancelablePromise)
		.then(
			() => {
				throw new Error('Not rejected');
			},
			reason => {
				expect(reason).toBe(3);
			}
		);
	});

	it('fulfills with .race()', () => {
		const value1 = new NativePromise(resolve => setTimeout(() => resolve(1), 10));
		const value2 = new CancelablePromise(resolve => setTimeout(() => resolve(2), 20));

		let cancelablePromise = CancelablePromise.race([value1, value2]);

		return NativePromise.resolve(cancelablePromise)
		.then(value => {
			expect(value).toBe(1);
		});
	});

	it('rejects with .race()', () => {
		const value1 = new NativePromise(resolve => setTimeout(() => resolve(1), 20));
		const value2 = new CancelablePromise((_resolve, reject) => setTimeout(() => reject(2), 10));

		let cancelablePromise = CancelablePromise.race([value1, value2]);

		return cancelablePromise
		.then(
			() => {
				throw new Error('Not rejected');
			},
			reason => {
				expect(reason).toBe(2);
			}
		);
	});

	// forceCancelable must participate in options-changed comparison in .resolve()
	it('.resolve() wraps with new instance when forceCancelable option differs', () => {
		const original = new CancelablePromise(resolve => resolve('value'));

		expect(original.forceCancelable).toBe(true);

		const wrapped = CancelablePromise.resolve(original, { forceCancelable: false });

		expect(wrapped).not.toBe(original);
		expect(wrapped.forceCancelable).toBe(false);
	});

	it('.resolve() returns same instance when options are unchanged', () => {
		const original = new CancelablePromise(resolve => resolve('value'), { forceCancelable: true });

		const same = CancelablePromise.resolve(original, { forceCancelable: true });

		expect(same).toBe(original);
	});

	// any() should feature-detect AggregateError and fall back when absent
	it('.any() rejects with AggregateError containing errors in input order when all reject', () => {
		const value1 = new CancelablePromise((_resolve, reject) => setTimeout(() => reject('err1'), 10));
		const value2 = new CancelablePromise((_resolve, reject) => setTimeout(() => reject('err2'), 20));
		const value3 = CancelablePromise.reject('err3');

		const cancelablePromise = CancelablePromise.any([value1, value2, value3]);

		return NativePromise.resolve(cancelablePromise)
		.then(
			() => {
				throw new Error('Not rejected');
			},
			reason => {
				expect(reason.name).toBe('AggregateError');
				expect(reason.errors).toEqual(['err1', 'err2', 'err3']);
			}
		);
	});
});

// Narrow argument-shape gaps left by earlier spec suites, no new semantics, just exercising
// already-specified behavior with untested argument shapes so branch coverage reflects what's
// actually implemented.
describe('coverage completion', () => {
	it('.finally() with no callback behaves like .finally(null) (passthrough)', async () => {
		const { CancelablePromise } = canc_promise;

		const resolved = await new CancelablePromise<number>(resolve => resolve(1)).finally();
		expect(resolved).toBe(1);

		await expect(
			new CancelablePromise<number>((_resolve, reject) => reject('boom')).finally()
		).rejects.toBe('boom');
	});

	it('.handleCancel() with a non-function is a no-op (does not throw, does not register)', () => {
		const { CancelablePromise } = canc_promise;

		const promise = new CancelablePromise<number>(() => {/**/});

		expect(() => promise.handleCancel(null as any)).not.toThrow();

		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		promise.cancel('stop');
		expect(promise.isCanceled).toBe(true);
	});

	it('constructor accepts a falsy-but-present signal option (options merge falsy branch)', () => {
		const { CancelablePromise } = canc_promise;

		expect(() => new CancelablePromise<number>(() => {/**/}, { signal: null as any })).not.toThrow();
	});
});

// AggregateError fallback test lives outside the Native-Promise-capture guard describe above:
// that describe's beforeEach spies on the global `Promise` getter and throws on access,
// which would fire spuriously here since isolateModules re-requires the module fresh.
describe('any() AggregateError ponyfill fallback', () => {
	it('falls back to ponyfill AggregateError when global AggregateError is missing', () => {
		const OriginalAggregateError = (global as any).AggregateError;
		delete (global as any).AggregateError;

		let IsolatedCancelablePromise: typeof canc_promise.CancelablePromise;

		jest.isolateModules(() => {
			IsolatedCancelablePromise = require('./cancelable-promise').CancelablePromise;
		});

		const cancelablePromise = IsolatedCancelablePromise!.any([
			IsolatedCancelablePromise!.reject('err1'),
			IsolatedCancelablePromise!.reject('err2'),
		]);

		return Promise.resolve(cancelablePromise)
		.then(
			() => {
				throw new Error('Not rejected');
			},
			(reason: any) => {
				expect(reason).toBeInstanceOf(Error);
				expect(reason.name).toBe('AggregateError');
				expect(reason.errors).toEqual(['err1', 'err2']);
			}
		)
		.finally(() => {
			(global as any).AggregateError = OriginalAggregateError;
		});
	});
});
