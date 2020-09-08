import * as canc_promise from './';


const { CancelablePromise, CancelError } = canc_promise;



// declare var require: any, afterEach: any, beforeEach: any, describe: any, it: any, expect: any, jest: any, global: any;

describe('', () => {
	it('is true', () => {
		expect(true).toBe(true);
	});
});

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
	let OriginalPromise: PromiseConstructor;
	let originalPromiseDescriptor: PropertyDescriptor;
	let CancelablePromise: typeof canc_promise.CancelablePromise;
	let promiseGetterSpy: jest.SpyInstance<PromiseConstructor>;

	beforeAll(() => {
		OriginalPromise = Promise;
		originalPromiseDescriptor = Object.getOwnPropertyDescriptor(global, 'Promise')!;

		// Make getter restorable with mockRestore
		Object.defineProperty(global, 'Promise', {
			get: () => OriginalPromise,
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
		expect(promiseGetterSpy).not.toBeCalled();
	});

	it('constructs fulfilled promise', () => {
		let cancelablePromise = new CancelablePromise(
			resolve => resolve('resolved')
		);

		return OriginalPromise.resolve(cancelablePromise)
		.then(value => {
			expect(value).toBe('resolved');
		});
	});

	it('constructs rejected promise', () => {
		let cancelablePromise = new CancelablePromise(
			(_resolve, reject) => reject('rejected')
		);

		return OriginalPromise.resolve(cancelablePromise)
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

		return OriginalPromise.resolve(cancelablePromise)
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

		return OriginalPromise.resolve(cancelablePromise)
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

		return OriginalPromise.resolve(cancelablePromise)
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

		return OriginalPromise.resolve(cancelablePromise)
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
		const value1 = new OriginalPromise(resolve => setTimeout(() => resolve(1), 10));
		const value2 = new CancelablePromise(resolve => setTimeout(() => resolve(2), 20));
		const value3 = OriginalPromise.resolve(3);
		const value4 = 4;

		let cancelablePromise = CancelablePromise.all([value1, value2, value3, value4]);

		return OriginalPromise.resolve(cancelablePromise)
		.then(value => {
			expect(value).toEqual([1, 2, 3, 4]);
		});
	});

	it('rejects with .all()', () => {
		const value1 = new OriginalPromise(resolve => setTimeout(() => resolve(1), 10));
		const value2 = new CancelablePromise((_resolve, reject) => setTimeout(() => reject(2), 10));
		const value3 = CancelablePromise.reject(3);
		const value4 = 4;

		let cancelablePromise = CancelablePromise.all([value1, value2, value3, value4]);

		return OriginalPromise.resolve(cancelablePromise)
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
		const value1 = new OriginalPromise(resolve => setTimeout(() => resolve(1), 10));
		const value2 = new CancelablePromise(resolve => setTimeout(() => resolve(2), 20));

		let cancelablePromise = CancelablePromise.race([value1, value2]);

		return OriginalPromise.resolve(cancelablePromise)
		.then(value => {
			expect(value).toBe(1);
		});
	});

	it('rejects with .race()', () => {
		const value1 = new OriginalPromise(resolve => setTimeout(() => resolve(1), 20));
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

	it('extends global Promise', () => {
	/* 	it('captures global Promise on import', async () => {
		const NativePromise = Promise;
		// const NativePromiseProxy = new Proxy(NativePromise, {});
		const nativePromise = new NativePromise<never>((_resolve) => {});

		const NativePromiseSpy = jest.spyOn(global, 'Promise')
		.mockReturnedValue(nativePromise);

		const { CancelablePromise } = require('./cancelable-promise');

		expect(NativePromiseSpy.isPrototypeOf(CancelablePromise)).toBe(true);

		const cancelablePromise = new CancelablePromise((_resolve: any) => {});

		expect(cancelablePromise).toEqual(expect.any(NativePromiseSpy));
	}); */


		// const NativePromise = Promise;
		// const NativePromiseProxy = new Proxy(NativePromise, {});
		// const nativePromise = new NativePromise<never>((_resolve) => {});
		// const promise = OriginalPromise.resolve();

		// const NativePromiseSpy = jest.spyOn(global, 'Promise')
		// .mockReturnValue(nativePromise);

	});
});
