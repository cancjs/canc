/**
 * Minimal, dependency-free type-assertion kit for the type-level assertion suite.
 *
 * We intentionally do NOT pull in `expect-type` or `tsd` as a runtime dep: the
 * suite runs only in the matrix's `latest` TS lane, and "latest" is now the
 * native TS 7 port whose type-checker those tools have not certified against.
 * These four helpers ARE the exact mechanism `expect-type`/`tsd` use internally
 * (an invariant `Equal<A, B>` conditional plus an `Expect<true>` gate), so the
 * assertions have identical fail-red behaviour: a wrong shipped type makes
 * `Expect<Equal<...>>` resolve to `false`, which is not assignable to `true`,
 * which is a hard `tsc` error.
 */

// Invariant structural equality (distinguishes `any`, tuples vs arrays, unions).
export type Equal<A, B> =
 (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// Gate: only `true` passes. `Expect<false>` is a compile error at the use site.
export type Expect<T extends true> = T;

// `A` must extend `B`.
export type ExpectExtends<A, B> = A extends B ? true : false;

// Detect the `any` escape hatch so assertions can forbid it.
export type IsAny<T> = 0 extends 1 & T ? true : false;

export type Not<T extends boolean> = T extends true ? false : true;
