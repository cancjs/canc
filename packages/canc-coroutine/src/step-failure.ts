import type { CancelError, FAILURE, Unlisted } from '@cancjs/promise';

// declared failures only: open marker and cancellation drop, native steps add nothing
export type CoFailureOf<T> =
  0 extends 1 & T ? never
  : T extends { readonly [FAILURE]?: infer F } ?
    [F] extends [undefined] ?
      never
    : Exclude<F, Unlisted | CancelError>
  : never;

// a one argument AsyncResult body yields unknown: failure undeclared, not empty
export type CoBodyFailureOf<TYield> =
  0 extends 1 & TYield ? never
  : unknown extends TYield ? unknown
  : CoFailureOf<TYield>;
