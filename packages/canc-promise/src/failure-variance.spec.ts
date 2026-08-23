import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import { CancelablePromise } from './cancelable-promise';

describe('failure variance', () => {
  it('types correctly', () => {
    class FooError extends Error {
      readonly tagFoo = 'foo';
    }
    class BarError extends Error {
      readonly tagBar = 'bar';
    }

    const b1 = null as unknown as CancelablePromise<number, FooError>;
    const b2 = null as unknown as CancelablePromise<number, FooError | BarError>;
    const b3 = null as unknown as CancelablePromise<number, never>;
    const bDefault = null as unknown as CancelablePromise<number>;

    // 1. Covariant widening (subset -> superset)
    const bWiden: CancelablePromise<number, FooError | BarError> = b1;

    // 2. Covariant narrowing (superset -> subset)
    // @ts-expect-error Narrowing rejected
    const bNarrow: CancelablePromise<number, FooError> = b2;

    // 3. Assigning from never / default
    const bFromNever: CancelablePromise<number, FooError> = b3;
    const bFromDefault: CancelablePromise<number, FooError> = bDefault;

    // 4. Assigning to never / default
    // @ts-expect-error Assigning FooError to never rejected
    const bToNever: CancelablePromise<number, never> = b1;
    // @ts-expect-error Assigning FooError to default (never) rejected
    const bToDefault: CancelablePromise<number> = b1;

    // Contravariance counter-example:
    // If the failure property were a function type `(e: E) => void`, function parameter
    // subtyping would flip the variance to contravariant, allowing narrowing
    // and rejecting widening.
    // Because [FAILURE]?: E is a plain optional property slot, it is covariant.

    // Vanilla interop
    const pFoo = null as unknown as CancelablePromise<number, FooError>;
    const pBar = null as unknown as CancelablePromise<string, BarError>;
    const plain = null as unknown as Promise<number>;
    const plainBool = null as unknown as Promise<boolean>;

    // @ts-expect-error Plain Promise lacks phantom property
    const toAny: CancelablePromise<number, unknown> = plain;
    const fromNever: Promise<number> = b3;
    const fromFoo: Promise<number> = b1;

    const arr: Promise<unknown>[] = [pFoo, pBar, plainBool];
    const nativeAll = Promise.all([pFoo, pBar]);
    const nativeAllCheck: Eq<typeof nativeAll, Promise<[number, string]>> = true;
    const nativeRace = Promise.race([pFoo, plainBool]);
    const nativeRaceCheck: Eq<typeof nativeRace, Promise<number | boolean>> = true;

    async function useAwait() {
      const _v = await pFoo;
      const c: Eq<typeof _v, number> = true;
      return c;
    }

    const awaitedCheck: Eq<Awaited<CancelablePromise<number, FooError>>, number> = true;

    function takesPromise(_p: Promise<number>): void {}
    takesPromise(pFoo);
    const settled = Promise.allSettled([pFoo, pBar]);

    void [
      bWiden,
      bNarrow,
      bFromNever,
      bFromDefault,
      bToNever,
      bToDefault,
      toAny,
      fromNever,
      fromFoo,
      arr,
      nativeAll,
      nativeAllCheck,
      nativeRace,
      nativeRaceCheck,
      useAwait,
      awaitedCheck,
      settled,
    ];
  });
});
