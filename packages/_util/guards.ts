// Any callable shape, where the arguments and the return really are not knowable: a method being
// wrapped by a decorator, a user callback being forwarded verbatim. Use this instead of the bare
// `Function` type, and instead of redeclaring the same alias per package.
export type TAnyFn = (...args: any[]) => any;

// Deliberately not a type predicate. Callers duck-type straight after the check: they read a
// `then` method, a brand symbol, an iterator. Narrowing to `object` strips the index signature
// those reads need, and narrowing to a record breaks the casts callers apply afterwards. Leaving
// the argument as-is keeps every call site working on the value it actually has.
export const isObject = (value: any): boolean => !!value && typeof value === 'object';

export const isFunction = (value: any): value is TAnyFn => typeof value === 'function';
