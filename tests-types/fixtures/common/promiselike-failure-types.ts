// A helper over a native or foreign thenable cannot know what it rejects with, so its failure set is open
import {
  CancelablePromise,
  catchAbort,
  catchCancel,
  catchErrors,
  catchTimeout,
  createCatchError,
  createSuppressError,
  FailureOf,
  suppressAbort,
  suppressCancel,
  suppressErrors,
  suppressTimeout,
  Unlisted,
} from '@cancjs/promise';

import type { Equal, Expect } from './assert-type';

class FooError extends Error {
  readonly foo = true;
}

declare const native: Promise<number>;
declare const declared: CancelablePromise<number, FooError>;

const cc = catchCancel(native);
type _cc = Expect<Equal<FailureOf<typeof cc>, Unlisted>>;
const ccFlags = catchCancel(native, { abort: true, timeout: true });
type _ccFlags = Expect<Equal<FailureOf<typeof ccFlags>, Unlisted>>;
const sc = suppressCancel(native);
type _sc = Expect<Equal<FailureOf<typeof sc>, Unlisted>>;
const ce = catchErrors(native, FooError);
type _ce = Expect<Equal<FailureOf<typeof ce>, Unlisted>>;
const se = suppressErrors(native, FooError);
type _se = Expect<Equal<FailureOf<typeof se>, Unlisted>>;
const ca = catchAbort(native);
type _ca = Expect<Equal<FailureOf<typeof ca>, Unlisted>>;
const ct = catchTimeout(native);
type _ct = Expect<Equal<FailureOf<typeof ct>, Unlisted>>;
const sa = suppressAbort(native);
type _sa = Expect<Equal<FailureOf<typeof sa>, Unlisted>>;
const st = suppressTimeout(native);
type _st = Expect<Equal<FailureOf<typeof st>, Unlisted>>;
const cce = createCatchError(FooError)(native);
type _cce = Expect<Equal<FailureOf<typeof cce>, Unlisted>>;
const cse = createSuppressError(FooError)(native);
type _cse = Expect<Equal<FailureOf<typeof cse>, Unlisted>>;

// a declared input keeps its own set, minus what the helper catches
const ccDeclared = catchCancel(declared);
type _ccDeclared = Expect<Equal<FailureOf<typeof ccDeclared>, FooError>>;
const ceDeclared = catchErrors(declared, FooError);
type _ceDeclared = Expect<Equal<FailureOf<typeof ceDeclared>, never>>;

// next to a declared member, the open marker keeps the union honest
const raced = CancelablePromise.race([catchCancel(native), declared]);
type _raced = Expect<Equal<FailureOf<typeof raced>, FooError | Unlisted>>;
