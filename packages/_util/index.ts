import type { ICancelable } from '@cancjs/promise';


export const isObject = (value: any): value is Object => !!value && typeof value === 'object';

export const isFunction = (value: any): value is Function => typeof value === 'function';

export const isThenable = (obj: any): obj is PromiseLike<any> => isObject(obj) && isFunction(obj.then);

export const isCancelable = (obj: any): obj is ICancelable => isThenable(obj) && isFunction((obj as Partial<ICancelable>).cancel);

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
