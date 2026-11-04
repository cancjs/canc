// A time helper or promisify over a native or foreign thenable cannot know what it rejects with
import type { CancelablePromise, FailureOf, Unlisted } from '@cancjs/promise';
import { delay, minDelay, promisify, retry } from '@cancjs/toolbox';

import type { Equal, Expect } from './assert-type';

class FooError extends Error {
  readonly foo = true;
}

declare const native: Promise<number>;
declare const declared: CancelablePromise<number, FooError>;
declare const closed: CancelablePromise<number, never>;

const delayNative = delay(native, 1);
type _delayNative = Expect<Equal<FailureOf<typeof delayNative>, Unlisted>>;
const delayThunk = delay(() => native, 1);
type _delayThunk = Expect<Equal<FailureOf<typeof delayThunk>, Unlisted>>;
const delayLazy = delay(native, 1, { lazy: true });
type _delayLazy = Expect<Equal<FailureOf<typeof delayLazy>, Unlisted>>;
const delayDeclared = delay(declared, 1);
type _delayDeclared = Expect<Equal<FailureOf<typeof delayDeclared>, FooError>>;
const delayDeclaredThunk = delay(() => declared, 1);
type _delayDeclaredThunk = Expect<Equal<FailureOf<typeof delayDeclaredThunk>, FooError>>;
const delayClosed = delay(closed, 1);
type _delayClosed = Expect<Equal<FailureOf<typeof delayClosed>, never>>;
const delayValue = delay(5, 1);
type _delayValue = Expect<Equal<FailureOf<typeof delayValue>, never>>;
const delayTimer = delay(1);
type _delayTimer = Expect<Equal<FailureOf<typeof delayTimer>, never>>;

const minNative = minDelay(native, 1);
type _minNative = Expect<Equal<FailureOf<typeof minNative>, Unlisted>>;
const minAsync = minDelay(async () => 1, 1);
type _minAsync = Expect<Equal<FailureOf<typeof minAsync>, Unlisted>>;
const minDeclared = minDelay(declared, 1);
type _minDeclared = Expect<Equal<FailureOf<typeof minDeclared>, FooError>>;
const minValue = minDelay(5, 1);
type _minValue = Expect<Equal<FailureOf<typeof minValue>, never>>;

const retryNative = retry(() => native);
type _retryNative = Expect<Equal<FailureOf<typeof retryNative>, Unlisted>>;
const retryAsync = retry(async () => 1);
type _retryAsync = Expect<Equal<FailureOf<typeof retryAsync>, Unlisted>>;
const retryLazy = retry(() => native, { lazy: true });
type _retryLazy = Expect<Equal<FailureOf<typeof retryLazy>, Unlisted>>;
const retryDeclared = retry(() => declared);
type _retryDeclared = Expect<Equal<FailureOf<typeof retryDeclared>, FooError>>;
const retryValue = retry(() => 1);
type _retryValue = Expect<Equal<FailureOf<typeof retryValue>, never>>;

const promisified = promisify((cb: (error: unknown, value: number) => void) => cb(null, 1));
type _promisified = Expect<Equal<FailureOf<ReturnType<typeof promisified>>, Unlisted>>;
const promisifiedLazy = promisify((cb: (error: unknown, value: number) => void) => cb(null, 1), { lazy: true });
type _promisifiedLazy = Expect<Equal<FailureOf<ReturnType<typeof promisifiedLazy>>, Unlisted>>;
