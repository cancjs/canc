async function* asyncGenFn() {
	let num = 1;
	while (num <= 3) {
		yield new Promise<number>(resolve => setTimeout(() => resolve(num++), 500));
	}
}

// eslint-disable-next-line @typescript-eslint/promise-function-async
const asyncIterate = <T = unknown>(asyncGen: AsyncGenerator<T>) => (
	Promise.resolve(asyncGen.next())
	.then((result) => (!result.done && result) as IteratorYieldResult<T>)
);

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
	const asyncGen = asyncGenFn();

	let num: number;
	while (({ value: num } = await asyncIterate(asyncGen))) {
		// while (let values = await asyncGen.next()) {
		// console.warn(result);
		console.log(num, 'while helper');
	}
})();

(async () => {
	const asyncGen = asyncGenFn();

	// eslint-disable-next-line no-cond-assign
	for (let num: number; { value: num } = await asyncIterate(asyncGen);) {
		// while (let values = await asyncGen.next()) {
		// console.warn(result);
		console.log(num, 'for helper');
	}
})();
