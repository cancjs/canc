import { CancelablePromise } from '@cancjs/promise';


const breakError = new Error('Break error');

function breakFn(): never {
	throw breakError;
}

// eslint-disable-next-line complexity
function forEachAsync<T>(iterable: T[] | ArrayLike<T> | Iterable<T>, fn: (value: T, index: number, iterable: T[] | ArrayLike<T> | Iterable<T>) => void, thisArg?: any): void {
	const isThisArg = arguments.length > 2;
	const symbolIterator = typeof Symbol !== 'undefined' && Symbol && Symbol.iterator;
	const symbolAsyncIterator = typeof Symbol !== 'undefined' && Symbol && Symbol.asyncIterator;
	const isIterable = symbolIterator && iterable && (iterable as any)[symbolIterator];
	const isAsyncIterable = symbolIterator && iterable && (iterable as any)[symbolAsyncIterator];

	const promise = new CancelablePromise((resolve, reject) => {
		// Sparse array or non-iterable array-like
		if (Array.isArray(iterable) || (!isIterable && typeof (iterable as ArrayLike<T>)?.length === 'number')) {
			try {
				for (let i = 0; i < (iterable as ArrayLike<T>).length; i++) {
					if (i in iterable) {
						if (isThisArg) {
							fn.call(thisArg, (iterable as ArrayLike<T>)[i], i, iterable);
						} else {
							// A tad faster
							fn((iterable as ArrayLike<T>)[i], i, iterable);
						}
					}
				}
			} catch (error) {
				if (error !== breakError) {
					throw error;
				}
			}
		// Iterable
		} else if (isIterable) {
			const iterator: Iterator<T> = (iterable as any)[symbolIterator as symbol]();
			let result: IteratorResult<T> | void;
			let isError = false;
			let rethrownError: any;

			try {
				for (let i = 0; !(result = iterator.next()).done; i++) {
					if (isThisArg) {
						fn.call(thisArg, result.value, i, iterable);
					} else {
						// A tad faster
						fn(result.value, i, iterable);
					}
				}
			} catch (error) {
				if (error !== breakError) {
					isError = true;
					rethrownError = error;
				}
			} finally {
				// eslint-disable-next-line eqeqeq, no-eq-null
				if (result && !(result.done) && iterator.return != null) {
					// Throw if non-nully and not a function
					iterator.return();
				}

				if (isError) {
					// eslint-disable-next-line no-unsafe-finally
					throw rethrownError;
				}
			}
		} else {
			throw new TypeError(`${String(iterable)} is not iterable`);
		}
	});

	return promise;
}

forEachAsync.break = breakFn;

export {};
