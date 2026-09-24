import type { CancelablePromise } from '@cancjs/promise';
import type { ICancelablePipeable } from '@cancjs/toolbox/async-iter';
import {
  concat,
  drop,
  every,
  filter,
  find,
  flatMap,
  forEach,
  from,
  includes,
  map,
  pipe,
  reduce,
  some,
  take,
  toArray,
  zip,
  zipKeyed,
} from '@cancjs/toolbox/async-iter';

import type { Equal, Expect } from './assert-type';

interface IThing {
  id: number;
  label: string;
}

const numbers: AsyncIterable<number> = from([1, 2, 3]);
const things: IThing[] = [
  { id: 1, label: 'alpha' },
  { id: 2, label: 'beta' },
];

function toLabel(thing: IThing): string {
  return thing.label;
}

function isLongLabel(label: string): label is string {
  return label.length > 4;
}

async function testOverloadLadder() {
  // 1. pipe(src, map(f), filter(g)) infers IPipeableAsyncIterable<O>, no any anywhere in result
  const lazy = pipe(
    numbers,
    map((x: number) => String(x)),
    filter((s: string) => s.length > 0),
  );
  type _tLazy = Expect<Equal<typeof lazy, ICancelablePipeable<string>>>;

  // 2. pipe(src, map(f), toArray()) infers CancelablePromise<O[]>
  const terminalPromise = pipe(
    numbers,
    map((x: number) => String(x)),
    toArray(),
  );
  type _tTerm = Expect<Equal<typeof terminalPromise, CancelablePromise<string[]>>>;

  // 3. pipe(src, toArray(), map(f)) is a compile error (terminal not last)
  // @ts-expect-error terminal must be the last operator
  pipe(numbers, toArray(), map((x: any) => x));

  // 4. pipe(src, toArray(), find(p)) is a compile error (two terminals)
  // @ts-expect-error cannot pipe two terminal operators
  pipe(numbers, toArray(), find(() => true));

  // 5. Chained: from(src).pipe(op).pipe(term)
  const chained = from([1, 2, 3])
    .pipe(map((x: number) => String(x)))
    .pipe(filter((s: string) => s.length > 0), toArray());
  type _tChained = Expect<Equal<typeof chained, CancelablePromise<string[]>>>;

  void lazy;
  void terminalPromise;
  void chained;
}

async function testArrayGroupedForm() {
  // 1. pipe(src, [map(named), filter(namedGuard)], toArray()) infers CancelablePromise<O[]>
  const grouped = pipe(things, [map(toLabel), filter(isLongLabel)], toArray());
  type _tGrouped = Expect<Equal<typeof grouped, CancelablePromise<string[]>>>;

  // 2. Nested arrays flatten and still thread
  const nested = pipe(things, [[map(toLabel)], [filter(isLongLabel)]], toArray());
  type _tNested = Expect<Equal<typeof nested, CancelablePromise<string[]>>>;

  // 3. Type mismatch between two adjacent ops resolves never
  function toId(thing: IThing): number {
    return thing.id;
  }
  function needString(s: string): string {
    return s;
  }
  const mismatched = pipe(things, [map(toId), map(needString)], toArray());
  type _tMismatch = Expect<Equal<typeof mismatched, never>>;

  // 4. Inline arrow inside array limit: array literals do not thread contextual type
  // @ts-expect-error inline arrow parameter has no contextual type inside array literal
  pipe(things, [map((x) => x.label)], toArray());

  void grouped;
  void nested;
  void mismatched;
}

async function testOperatorInference() {
  // filter with type guard narrows
  function isNumber(x: number | string): x is number {
    return typeof x === 'number';
  }
  const mixed: AsyncIterable<number | string> = from([1, 'a', 2]);
  const filtered = pipe(mixed, filter(isNumber));
  type _tFiltered = Expect<Equal<typeof filtered, ICancelablePipeable<number>>>;

  // zip preserves tuple
  const zipped = zip(numbers, ['a', 'b']);
  type _tZipped = Expect<Equal<typeof zipped, ICancelablePipeable<[number, string]>>>;

  // zipKeyed preserves shape
  const keyed = zipKeyed({ count: numbers, label: ['a', 'b'] });
  type _tKeyed = Expect<Equal<typeof keyed, ICancelablePipeable<{ count: number; label: string }>>>;

  // reduce with init
  const reducedWithInit = pipe(numbers, reduce((acc: number, val: number) => acc + val, 0));
  type _tReducedWithInit = Expect<Equal<typeof reducedWithInit, CancelablePromise<number>>>;

  // reduce without init
  const reducedNoInit = pipe(numbers, reduce((acc: number, val: number) => acc + val));
  type _tReducedNoInit = Expect<Equal<typeof reducedNoInit, CancelablePromise<number>>>;

  // from<T> reads T from source
  const fromAwaited = from([Promise.resolve(1), Promise.resolve(2)]);
  type _tFromAwaited = Expect<Equal<typeof fromAwaited, ICancelablePipeable<number>>>;

  const joined = concat(numbers, [4, 5]);
  type _tJoined = Expect<Equal<typeof joined, ICancelablePipeable<number>>>;

  // terminals
  const found = pipe(numbers, find((x: number) => x > 1));
  type _tFound = Expect<Equal<typeof found, CancelablePromise<number | undefined>>>;

  const somed = pipe(numbers, some((x: number) => x > 1));
  type _tSomed = Expect<Equal<typeof somed, CancelablePromise<boolean>>>;

  const everyed = pipe(numbers, every((x: number) => x > 1));
  type _tEveryed = Expect<Equal<typeof everyed, CancelablePromise<boolean>>>;

  const each = pipe(numbers, forEach((_x: number) => {}));
  type _tEach = Expect<Equal<typeof each, CancelablePromise<void>>>;

  const inc = pipe(numbers, includes(1));
  type _tInc = Expect<Equal<typeof inc, CancelablePromise<boolean>>>;

  const dropped = pipe(numbers, drop<number>(1));
  type _tDropped = Expect<Equal<typeof dropped, ICancelablePipeable<number>>>;

  const taken = pipe(numbers, take<number>(1));
  type _tTaken = Expect<Equal<typeof taken, ICancelablePipeable<number>>>;

  const flatMapped = pipe(numbers, flatMap((x: number) => [x, x * 2]));
  type _tFlatMapped = Expect<Equal<typeof flatMapped, ICancelablePipeable<number>>>;

  void filtered;
  void zipped;
  void keyed;
  void reducedWithInit;
  void reducedNoInit;
  void fromAwaited;
  void joined;
  void found;
  void somed;
  void everyed;
  void each;
  void inc;
  void dropped;
  void taken;
  void flatMapped;
}

export { testArrayGroupedForm, testOperatorInference, testOverloadLadder };
