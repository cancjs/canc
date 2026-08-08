import { CancelablePromise } from './cancelable-promise';

describe('failure variance', () => {
  it('types correctly', () => {
    class FooError extends Error {
      readonly tagFoo = 'foo';
    }
    class BarError extends Error {
      readonly tagBar = 'bar';
    }

    const b1 = null as any as CancelablePromise<number, FooError>;
    const b2 = null as any as CancelablePromise<number, FooError | BarError>;
    const b3 = null as any as CancelablePromise<number, never>;

    const bWiden: CancelablePromise<number, FooError | BarError> = b1;
    // @ts-expect-error Narrowing
    const bNarrow: CancelablePromise<number, FooError> = b2;
    const bFromNever: CancelablePromise<number, FooError> = b3;
    // @ts-expect-error Narrowing
    const bToNever: CancelablePromise<number, never> = b1;

    // Vanilla interop
    const pFoo = null as any as CancelablePromise<number, FooError>;
    const pBar = null as any as CancelablePromise<string, BarError>;
    const plain = null as any as Promise<number>;
    const plainBool = null as any as Promise<boolean>;

    // @ts-expect-error Missing phantom
    const toAny: CancelablePromise<number, any> = plain; // Assign native Promise to CP<..., any>
    const fromNever: Promise<number> = b3; // Assign CP<..., never> to native Promise
    const fromFoo: Promise<number> = b1; // Assign CP<..., FooError> to native Promise

    type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

    const arr: Promise<unknown>[] = [pFoo, pBar, plainBool];
    const nativeAll = Promise.all([pFoo, pBar]);
    const nativeAllCheck: Eq<typeof nativeAll, Promise<[number, string]>> = true;
    const nativeRace = Promise.race([pFoo, plainBool]);
    const nativeRaceCheck: Eq<typeof nativeRace, Promise<number | boolean>> = true;
    async function useAwait() {
      const c: Eq<Awaited<typeof pFoo>, number> = true;
      return c;
    }
    function takesPromise(_p: Promise<number>): void {}
    takesPromise(pFoo);
    const settled = Promise.allSettled([pFoo, pBar]);

    void [
      bWiden,
      bNarrow,
      bFromNever,
      bToNever,
      toAny,
      fromNever,
      fromFoo,
      arr,
      nativeAll,
      nativeAllCheck,
      nativeRace,
      nativeRaceCheck,
      useAwait,
      settled,
    ];
  });
});
