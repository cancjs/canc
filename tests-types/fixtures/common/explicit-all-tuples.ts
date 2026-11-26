import type { Unlisted } from '@cancjs/promise';
import { CancelablePromise as CP } from '@cancjs/promise';

import type { Assert, Eq } from './assert-type';

class TupleError extends Error {
  readonly tuple = true;
}

declare const typed: CP<number, TupleError>;
declare const native: PromiseLike<string>;

const tuple2 = CP.all<number, string>([typed, native] as const, {});
type _tuple2 = Assert<Eq<typeof tuple2, CP<[number, string], Unlisted>>>;
const tuple3 = CP.all<number, string, boolean>([typed, native, true] as const, {});
type _tuple3 = Assert<Eq<typeof tuple3, CP<[number, string, boolean], Unlisted>>>;
const tuple4 = CP.all<number, string, boolean, boolean>([typed, native, true, true] as const, {});
type _tuple4 = Assert<Eq<typeof tuple4, CP<[number, string, boolean, boolean], Unlisted>>>;
const tuple5 = CP.all<number, string, boolean, boolean, boolean>([typed, native, true, true, true] as const, {});
type _tuple5 = Assert<Eq<typeof tuple5, CP<[number, string, boolean, boolean, boolean], Unlisted>>>;
const tuple6 = CP.all<number, string, boolean, boolean, boolean, boolean>(
  [typed, native, true, true, true, true] as const,
  {},
);
type _tuple6 = Assert<Eq<typeof tuple6, CP<[number, string, boolean, boolean, boolean, boolean], Unlisted>>>;
const tuple7 = CP.all<number, string, boolean, boolean, boolean, boolean, boolean>(
  [typed, native, true, true, true, true, true] as const,
  {},
);
type _tuple7 = Assert<Eq<typeof tuple7, CP<[number, string, boolean, boolean, boolean, boolean, boolean], Unlisted>>>;
const tuple8 = CP.all<number, string, boolean, boolean, boolean, boolean, boolean, boolean>(
  [typed, native, true, true, true, true, true, true] as const,
  {},
);
type _tuple8 = Assert<
  Eq<typeof tuple8, CP<[number, string, boolean, boolean, boolean, boolean, boolean, boolean], Unlisted>>
>;
const tuple9 = CP.all<number, string, boolean, boolean, boolean, boolean, boolean, boolean, boolean>(
  [typed, native, true, true, true, true, true, true, true] as const,
  {},
);
type _tuple9 = Assert<
  Eq<typeof tuple9, CP<[number, string, boolean, boolean, boolean, boolean, boolean, boolean, boolean], Unlisted>>
>;
const tuple10 = CP.all<number, string, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean>(
  [typed, native, true, true, true, true, true, true, true, true] as const,
  {},
);
type _tuple10 = Assert<
  Eq<
    typeof tuple10,
    CP<[number, string, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean], Unlisted>
  >
>;
const raw = CP.all([typed, 's'] as const);
type _raw = Assert<Eq<typeof raw, CP<[number, 's'], TupleError>>>;
const rawNative = CP.all([typed, native] as const);
type _rawNative = Assert<Eq<typeof rawNative, CP<[number, string], TupleError | Unlisted>>>;
const plain = CP.all<number, string>([1, 's']);
type _plain = Assert<Eq<typeof plain, CP<[number, string], never>>>;
const single = CP.all<number>(new Set([Promise.resolve(1)]));
const race = CP.race<number>(new Set([Promise.resolve(1)]));
// Existing single-value overloads deliberately stay unchanged here.
type _singleValue = Assert<Eq<typeof single, CP<number[], never>>>;
type _raceValue = Assert<Eq<typeof race, CP<number, never>>>;

// @ts-expect-error explicit tuple element type still checked
CP.all<number, string>([Promise.resolve('wrong'), 's']);
// @ts-expect-error explicit tuple arity still checked
CP.all<number, string>([Promise.resolve(1)]);
