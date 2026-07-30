import type { ICancelable } from '@cancjs/promise';

// Deliberately not a type predicate. Callers duck-type straight after the check: they read a
// `then` method, a brand symbol, an iterator. Narrowing to `object` strips the index signature
// those reads need, and narrowing to a record breaks the casts callers apply afterwards. Leaving
// the argument as-is keeps every call site working on the value it actually has.
export const isObject = (value: any): boolean => !!value && typeof value === 'object';

export const isFunction = (value: any): value is Function => typeof value === 'function';

export const isThenable = (obj: any): obj is PromiseLike<any> => isObject(obj) && isFunction(obj.then);

export const isGenerator = (value: any): value is Generator =>
	isObject(value) && isFunction(value.next) && isFunction(value[Symbol.iterator]);

export const isCancelable = (obj: any): obj is ICancelable =>
	isThenable(obj) && isFunction((obj as Partial<ICancelable>).cancel);

// Feature-detect native AggregateError (missing in older engines, e.g. pre-2021 QuickJS/Hermes);
// fall back to a plain Error shaped the same way (name + errors property) so callers can rely on
// a consistent shape regardless of global availability.
declare const AggregateError: (new (errors: Iterable<any>, message?: string) => Error & { errors: any[] }) | undefined;

export function createAggregateError(errors: any[], message?: string): Error & { errors: any[] } {
	if (typeof AggregateError === 'function') {
		return new AggregateError(errors, message);
	}

	const error = new Error(message) as Error & { errors: any[] };

	error.name = 'AggregateError';
	error.errors = errors;

	return error;
}

// A method decorator that replaces the method with a wrapper (coroutine or bound fn) hands back a
// brand-new function object. Metadata and properties another decorator attached to the ORIGINAL
// function are keyed on that function's identity and would be lost on the wrapper. Copy them over
// so decorators applied earlier in the stack (e.g. reflect-metadata's own-function metadata set by
// SetMetadata-style helpers) keep working. Metadata keyed on the class prototype + property key
// is untouched by wrapping and needs no copying.
export function copyFunctionMetadata(source: Function, target: Function): Function {
	if (source === target) {
		return target;
	}

	// reflect-metadata own-function metadata (feature-detected; absent without reflect-metadata).
	const reflect = (typeof Reflect !== 'undefined' ? Reflect : undefined) as any;
	if (
		reflect &&
		isFunction(reflect.getOwnMetadataKeys) &&
		isFunction(reflect.getOwnMetadata) &&
		isFunction(reflect.defineMetadata)
	) {
		const keys = reflect.getOwnMetadataKeys(source) as any[];
		for (let i = 0; i < keys.length; i++) {
			reflect.defineMetadata(keys[i], reflect.getOwnMetadata(keys[i], source), target);
		}
	}

	// Own enumerable properties another decorator may have tacked onto the function.
	const propNames = Object.keys(source);
	for (let i = 0; i < propNames.length; i++) {
		const descriptor = Object.getOwnPropertyDescriptor(source, propNames[i]);
		if (descriptor) {
			Object.defineProperty(target, propNames[i], descriptor);
		}
	}

	// Preserve identity-adjacent metadata so stack traces and arity checks still read the original.
	copyOwnProperty(source, target, 'name');
	copyOwnProperty(source, target, 'length');

	return target;
}

function copyOwnProperty(source: Function, target: Function, key: 'name' | 'length'): void {
	const descriptor = Object.getOwnPropertyDescriptor(source, key);
	if (descriptor) {
		try {
			Object.defineProperty(target, key, descriptor);
		} catch {
			// Non-configurable target slot (rare); leave the wrapper's own value in place.
		}
	}
}

// Stage-3 decorators pass `(value, context)` where context is an object carrying `kind`; legacy
// (TS `experimentalDecorators` and babel legacy) decorators pass `(target, propertyKey, descriptor?)`
// where the second argument is the property key itself (string or symbol). The two call shapes are
// distinguishable on the second argument alone, which lets each decorator flavor detect being
// invoked with the wrong transform's output and fail with a message pointing at the right import
// instead of a confusing shape-mismatch crash deeper in the implementation.
export const isLegacyShapedSecondArg = (value: any): value is string | symbol =>
	typeof value === 'string' || typeof value === 'symbol';

export const isStage3Context = (value: any): value is { kind: string } =>
	isObject(value) && typeof (value as any).kind === 'string';

// Babel-legacy descriptors always carry an `initializer` key for fields (a function, or explicitly
// null when uninitialized) and a real descriptor object for methods/getters/setters. TS-legacy never
// passes a descriptor for fields at all (2-arg call) and never sets `initializer`. Presence of the
// `initializer` key (own or inherited via the object literal babel emits) is therefore a reliable
// tell that a babel-legacy-shaped descriptor was handed to a TS-legacy decorator.
export const isBabelLegacyDescriptor = (descriptor: any): boolean =>
	isObject(descriptor) && 'initializer' in descriptor;
