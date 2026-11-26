import type { Unlisted } from '@cancjs/promise';
import { CancelablePromise as CP } from '@cancjs/promise';

import type { Assert, Eq } from './assert-type';

class InputError extends Error {
  readonly input = true;
}

declare const typed: CP<number, InputError>;
declare const native: PromiseLike<number>;

const resolved = CP.resolve<number>(native);
type _resolved = Assert<Eq<typeof resolved, CP<number, Unlisted>>>;
const erased = CP.resolve<number>(typed);
type _erased = Assert<Eq<typeof erased, CP<number, Unlisted>>>;
const inferred = CP.resolve(typed);
type _inferred = Assert<Eq<typeof inferred, CP<number, InputError>>>;
const raw = CP.resolve<number>(1);
type _raw = Assert<Eq<typeof raw, CP<number, never>>>;
const empty = CP.resolve();
type _empty = Assert<Eq<typeof empty, CP<void, never>>>;
function resolveGeneric<T>(input: T | PromiseLike<T>) {
  return CP.resolve<T>(input);
}
const generic = resolveGeneric<number>(native);
type _generic = Assert<Eq<typeof generic, CP<number, Unlisted>>>;

const attempted = CP.try<string, [number, boolean]>((n, b) => Promise.resolve(String(n) + b), 1, false);
type _attempted = Assert<Eq<typeof attempted, CP<string, Unlisted>>>;
const attemptedTyped = CP.try(() => typed);
type _attemptedTyped = Assert<Eq<typeof attemptedTyped, CP<number, InputError>>>;
const attemptedErased = CP.try<number, []>(() => typed);
type _attemptedErased = Assert<Eq<typeof attemptedErased, CP<number, Unlisted>>>;
const attemptedPlain = CP.try<number, []>(() => 1);
type _attemptedPlain = Assert<Eq<typeof attemptedPlain, CP<number, never>>>;
function tryGeneric<T>(fn: () => T | PromiseLike<T>) {
  return CP.try<T, []>(fn);
}
const attemptedGeneric = tryGeneric<number>(() => native);
type _attemptedGeneric = Assert<Eq<typeof attemptedGeneric, CP<number, Unlisted>>>;

// @ts-expect-error a string is not a number
CP.resolve<number>(Promise.resolve('wrong'));
// @ts-expect-error the argument tuple is still checked
CP.try<number, [number]>((n) => Promise.resolve(n), 'wrong');
// @ts-expect-error the callback result is still checked
CP.try<number, []>(() => Promise.resolve('wrong'));
