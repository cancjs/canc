const isFunction = (value) => typeof value === 'function';

function co(genFn, options = {}) {
	if (!isFunction(genFn)) {
		throw new TypeError('Argument is not a function');
	}

	const displayName = genFn.displayName || genFn.name;

	if (displayName) {
		coWrapper.displayName = 'coroutine ' + displayName;
	}

	function coWrapper(...args) {
		const promise = new CancelablePromise((resolve, reject, handleCancel) => {
			const gen = genFn.apply(this, args);

			handleCancel((reason) => {
				// isCanceled = true;
				gen.return();
			});

			function onFulfilled(value) {
				try {
					step(gen.next(value));
				} catch (err) {
					reject(err);
				}
			}

			function onRejected(value) {
				try {
					step(gen.throw(value));
				} catch (err) {
					reject(err);
				}
			}

			function step(result) {
				if (result.done) {
					if (!promise.isCanceled) {
						resolve(result.value);
					}
				} else {
					CancelablePromise.resolve(result.value).then(onFulfilled, onRejected);
				}
			}

			step(gen.next());
		});

		return promise;
	};

	return coWrapper;
}
