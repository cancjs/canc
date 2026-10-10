import type { FAILURE, Unlisted } from '@cancjs/promise';

// only declared failures count: the open marker drops, native steps and plain values add nothing
export type CoFailureOf<T> =
  0 extends 1 & T ? never
  : T extends { readonly [FAILURE]?: infer F } ?
    [F] extends [undefined] ?
      never
    : Exclude<F, Unlisted>
  : never;
