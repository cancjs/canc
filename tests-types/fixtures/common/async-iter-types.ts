/**
 * Type-level fixture for async-iter API. Proves typing contracts: pipe returns
 * AsyncIterable for pipeable ops, CancelablePromise for terminals, generics thread
 * correctly, and terminal-not-last / two-terminals are type errors.
 *
 * Compiled once per TS version. Must stay compatible down to TS 4.2 floor.
 */

// Type testing imports
import type { Expect, Equal } from '@type-testing/expect';

import * as asyncIter from '@cancjs/toolbox/async-iter';
import type { IPipeableAsyncIterable, ITermOp, IPipeOp } from '@cancjs/toolbox/async-iter';
import type { CancelablePromise } from '@cancjs/promise';

/**
 * Type tests: pipe without terminal returns AsyncIterable<Out>
 */
const _test_pipe_no_terminal = () => {
  const src = [1, 2, 3];
  const piped = asyncIter.pipe(src, [asyncIter.map((x) => x * 2)]);

  // Result must be iterable
  type T1 = Expect<Equal<typeof piped, IPipeableAsyncIterable<number>>>;
  void _test_pipe_no_terminal satisfies () => void;
};

/**
 * Type tests: pipe with terminal returns CancelablePromise<Result>
 */
const _test_pipe_with_terminal = async () => {
  const src = [1, 2, 3];
  const result = await asyncIter.pipe(src, [asyncIter.map((x) => x * 2)], asyncIter.toArray())();

  type T1 = Expect<Equal<typeof result, number[]>>;
  void _test_pipe_with_terminal satisfies () => Promise<void>;
};

/**
 * Type tests: chained map/filter operations thread the element type
 */
const _test_pipe_chain_threading = () => {
  const src = [1, 2, 3];
  const piped = asyncIter.pipe(
    src,
    [
      asyncIter.map((x) => `num_${x}`),
      asyncIter.filter((s) => s.length > 4),
    ],
  );

  // After map: string; after filter: still string
  type T1 = Expect<Equal<typeof piped, IPipeableAsyncIterable<string>>>;
  void _test_pipe_chain_threading satisfies () => void;
};

/**
 * Type tests: from returns a pipeable async iterable with ONLY .pipe, no terminal methods
 */
const _test_from_is_pipeable = () => {
  const iter = asyncIter.from([1, 2, 3]);

  // Must be pipeable
  type T1 = Expect<Equal<typeof iter, IPipeableAsyncIterable<number>>>;

  // Accessing .pipe must work
  const _piped = iter.pipe([asyncIter.map((x) => x)]);

  // Accessing a terminal method must fail (not present on the surface)
  // @ts-expect-error from() does not have a .find method
  const _badFind = iter.find(() => true);
};

/**
 * Type tests: from<T> infers T from the source
 */
const _test_from_inference = () => {
  const iter1 = asyncIter.from([1, 2, 3]);
  type T1 = Expect<Equal<typeof iter1, IPipeableAsyncIterable<number>>>;

  const iter2 = asyncIter.from(['a', 'b']);
  type T2 = Expect<Equal<typeof iter2, IPipeableAsyncIterable<string>>>;

  const iter3 = asyncIter.from(Promise.resolve(42));
  type T3 = Expect<Equal<typeof iter3, IPipeableAsyncIterable<number>>>;
};

/**
 * Type tests: pipe<T> with a source infers T correctly
 */
const _test_pipe_inference = () => {
  const src: AsyncIterable<number> = asyncIter.from([1, 2, 3]);

  // After map to string, element type must be string
  const piped = asyncIter.pipe(src, [asyncIter.map((x) => String(x))]);

  type T1 = Expect<Equal<typeof piped, IPipeableAsyncIterable<string>>>;
  void _test_pipe_inference satisfies () => void;
};

/**
 * Type tests: generator-fn callback return infers the output type O
 */
const _test_gen_callback_return_inference = () => {
  function* mapBody(value: number): Generator<Promise<number>, string, number> {
    const resolved = yield Promise.resolve(value * 2);
    return `result_${resolved}`;
  }

  const piped = asyncIter.pipe([1, 2, 3], [asyncIter.map(mapBody)]);

  // Output of the generator is string (the return type)
  type T1 = Expect<Equal<typeof piped, IPipeableAsyncIterable<string>>>;
  void _test_gen_callback_return_inference satisfies () => void;
};

/**
 * Type tests: async callback returns a promise of the result
 */
const _test_async_callback_return_inference = () => {
  const piped = asyncIter.pipe([1, 2, 3], [
    asyncIter.map(async (x) => {
      return x * 2;
    }),
  ]);

  type T1 = Expect<Equal<typeof piped, IPipeableAsyncIterable<number>>>;
  void _test_async_callback_return_inference satisfies () => void;
};

/**
 * Type tests: named filter callback with type guard
 */
const _test_filter_type_guard = () => {
  function isPositive(x: number | string): x is number {
    return typeof x === 'number' && x > 0;
  }

  const src: Array<number | string> = [1, 'a', 2, 'b'];
  const piped = asyncIter.pipe(src, [asyncIter.filter(isPositive)]);

  // After filter with type guard, element type narrows to number
  type T1 = Expect<Equal<typeof piped, IPipeableAsyncIterable<number>>>;
  void _test_filter_type_guard satisfies () => void;
};

/**
 * Type tests: zip yields correct tuple type
 */
const _test_zip_tuple = () => {
  const iter = asyncIter.zip([1, 2], ['a', 'b'], [true, false]);

  type T1 = Expect<Equal<typeof iter, IPipeableAsyncIterable<[number, string, boolean]>>>;
  void _test_zip_tuple satisfies () => void;
};

/**
 * Type tests: zipKeyed yields object with inferred shape
 */
const _test_zipKeyed_shape = () => {
  const iter = asyncIter.zipKeyed({
    nums: [1, 2],
    strs: ['a', 'b'],
  });

  type T1 = Expect<Equal<typeof iter, IPipeableAsyncIterable<{ nums: number; strs: string }>>>;
  void _test_zipKeyed_shape satisfies () => void;
};

/**
 * Type tests: terminal-not-last is a type error
 */
const _test_terminal_not_last_error = () => {
  // @ts-expect-error terminal must be last; map after toArray() is invalid
  const _result = asyncIter.pipe(
    [1, 2, 3],
    [asyncIter.toArray(), asyncIter.map((x: any) => x)],
  );
};

/**
 * Type tests: two terminals in sequence is a type error
 */
const _test_two_terminals_error = () => {
  // @ts-expect-error cannot pipe two terminal operators
  const _result = asyncIter.pipe([1, 2, 3], [asyncIter.toArray(), asyncIter.find(() => true)]);
};

/**
 * Type tests: concat returns pipeable async iterable
 */
const _test_concat_type = () => {
  const iter = asyncIter.concat([1, 2], [3, 4]);

  type T1 = Expect<Equal<typeof iter, IPipeableAsyncIterable<number>>>;
  void _test_concat_type satisfies () => void;
};

/**
 * Type tests: toArray() returns a function that takes AsyncIterable<T> and returns CancelablePromise<T[]>
 */
const _test_toArray_signature = () => {
  const term = asyncIter.toArray<number>();

  // term is a terminal op — a unary function
  type T1 = Expect<Equal<typeof term, ITermOp<number, number[]>>>;

  // Applying it to a source gives a CancelablePromise
  const result = term([1, 2, 3]);
  type T2 = Expect<Equal<typeof result, CancelablePromise<number[]>>>;
};

/**
 * Type tests: find() returns CancelablePromise<T | undefined>
 */
const _test_find_signature = () => {
  const term = asyncIter.find<number>((x) => x > 0);

  const result = term([1, 2, 3]);
  type T1 = Expect<Equal<typeof result, CancelablePromise<number | undefined>>>;
};

/**
 * Type tests: reduce with init returns CancelablePromise<Acc>
 */
const _test_reduce_with_init = () => {
  const result = await asyncIter.reduce<number, number>((acc, x) => acc + x, 0)([1, 2, 3]);

  type T1 = Expect<Equal<typeof result, number>>;
  void _test_reduce_with_init satisfies () => Promise<void>;
};

/**
 * Type tests: reduce without init uses first element as seed, result type is same as element
 */
const _test_reduce_no_init = () => {
  const result = await asyncIter.reduce<number>((acc, x) => acc + x)([1, 2, 3]);

  type T1 = Expect<Equal<typeof result, number>>;
  void _test_reduce_no_init satisfies () => Promise<void>;
};

/**
 * Type tests: forEach returns CancelablePromise<undefined>
 */
const _test_forEach_signature = () => {
  const result = await asyncIter.forEach<number>(() => {})([1, 2, 3]);

  type T1 = Expect<Equal<typeof result, void>>;
  void _test_forEach_signature satisfies () => Promise<void>;
};

/**
 * Type tests: some/every return CancelablePromise<boolean>
 */
const _test_some_every_signature = () => {
  const someResult = await asyncIter.some<number>((x) => x > 0)([1, 2, 3]);
  type T1 = Expect<Equal<typeof someResult, boolean>>;

  const everyResult = await asyncIter.every<number>((x) => x > 0)([1, 2, 3]);
  type T2 = Expect<Equal<typeof everyResult, boolean>>;

  void _test_some_every_signature satisfies () => Promise<void>;
};

/**
 * Type tests: includes returns CancelablePromise<boolean>
 */
const _test_includes_signature = () => {
  const result = await asyncIter.includes<number>(1)([1, 2, 3]);

  type T1 = Expect<Equal<typeof result, boolean>>;
  void _test_includes_signature satisfies () => Promise<void>;
};

/**
 * Type tests: flatMap output type infers from the inner map function
 */
const _test_flatMap_inference = () => {
  const piped = asyncIter.pipe([1, 2], [asyncIter.flatMap((x) => [`${x}a`, `${x}b`])]);

  type T1 = Expect<Equal<typeof piped, IPipeableAsyncIterable<string>>>;
  void _test_flatMap_inference satisfies () => void;
};

/**
 * Type tests: take/drop return pipeable with same element type
 */
const _test_take_drop_preserve_type = () => {
  const piped1 = asyncIter.pipe([1, 2, 3], [asyncIter.take(2)]);
  type T1 = Expect<Equal<typeof piped1, IPipeableAsyncIterable<number>>>;

  const piped2 = asyncIter.pipe([1, 2, 3], [asyncIter.drop(1)]);
  type T2 = Expect<Equal<typeof piped2, IPipeableAsyncIterable<number>>>;

  void _test_take_drop_preserve_type satisfies () => void;
};

/**
 * Runtime smoke: all these operations must actually compile without errors.
 * This is verified by the TS compiler pass.
 */
const _smoke = async () => {
  // Basic workflow
  const nums = await asyncIter.pipe([1, 2, 3, 4], [
    asyncIter.filter((x) => x % 2 === 0),
    asyncIter.map((x) => x * 2),
  ], asyncIter.toArray())();

  // from().pipe() workflow
  const strs = await asyncIter
    .from(['hello', 'world'])
    .pipe([asyncIter.map((s) => s.length)], asyncIter.toArray())();

  // Terminal directly
  const sum = await asyncIter.reduce<number, number>((a, b) => a + b, 0)([1, 2, 3]);

  void { nums, strs, sum };
};
