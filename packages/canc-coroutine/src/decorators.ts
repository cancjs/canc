export function coroutineDecorator<T = any>(target: any, key: string, descriptor?: TypedPropertyDescriptor<T>): TypedPropertyDescriptor<T> {
	const fn: Function = descriptor ? descriptor.value : target[key];

	descriptor = {
		configurable: true,
		enumerable: false,
		value: function (this: any, ...args: any[]) {
			return fn.apply(this, args);
		} as unknown as T
	};

	return descriptor;
}
