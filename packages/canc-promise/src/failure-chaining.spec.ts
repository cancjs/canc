import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import { CancelError } from './cancel-error';
import { CancelablePromise, FailureOf } from './cancelable-promise';
import { makeCancelable } from './helpers';
import type { Unlisted } from './index';

describe('failure chaining and statics', () => {
  class FooError extends Error {
    readonly tagFoo = 'foo';
  }
  class BarError extends Error {
    readonly tagBar = 'bar';
  }

  const pFoo = CancelablePromise.resolve(1) as any as CancelablePromise<number, FooError>;
  const pBar = CancelablePromise.resolve('a') as any as CancelablePromise<string, BarError>;
  const pBoth = CancelablePromise.resolve(1) as any as CancelablePromise<number, FooError | BarError | CancelError>;
  const plainBool = Promise.resolve(true);
  function failsBar(_n: number): CancelablePromise<string, BarError> {
    return CancelablePromise.resolve('b') as any;
  }

  it('types chaining methods (then, catch, finally) correctly', () => {
    // p6-then.ts & p7-thenraw.ts
    const _a = pFoo.then((n) => n + 1);
    const ca: Eq<typeof _a, CancelablePromise<number, FooError>> = true;

    const _b = pFoo.then(
      (n) => n + 1,
      () => 0,
    );
    const cb: Eq<typeof _b, CancelablePromise<number, never>> = true;

    const _c = pFoo.then((n) => failsBar(n));
    const cc: Eq<typeof _c, CancelablePromise<string, FooError | BarError>> = true;

    const _cPromise = pFoo.then((n) => Promise.resolve(String(n)));
    const cce: Eq<typeof _cPromise, CancelablePromise<string, FooError | Unlisted>> = true;

    const _cLit = pFoo.then(() => 5);
    const ccl: Eq<typeof _cLit, CancelablePromise<number, FooError>> = true;

    const _d = pBoth.catch(() => 0);
    const cd: Eq<typeof _d, CancelablePromise<number, never>> = true;

    const _e = pBoth.catch(() => failsBar(1));
    const ce: Eq<typeof _e, CancelablePromise<number | string, BarError>> = true;

    const _f = pBoth.finally(() => {});
    const cf: Eq<typeof _f, CancelablePromise<number, FooError | BarError | CancelError>> = true;

    const chain: Promise<string> = pFoo.then((n) => String(n));

    void [ca, cb, cc, cce, ccl, cd, ce, cf, chain];
  });

  it('keeps the declared failure on catch without a handler', async () => {
    const _none = pFoo.catch();
    const cNone: Eq<typeof _none, CancelablePromise<number, FooError>> = true;

    const _null = pFoo.catch(null);
    const cNull: Eq<typeof _null, CancelablePromise<number, FooError>> = true;

    const _undef = pFoo.catch(undefined);
    const cUndef: Eq<typeof _undef, CancelablePromise<number, FooError>> = true;

    const maybeHandler = (() => 0) as ((reason: FooError) => number) | undefined;
    const _maybe = pFoo.catch(maybeHandler);
    const cMaybe: Eq<typeof _maybe, CancelablePromise<number, FooError>> = true;

    const maybeFailing = (() => failsBar(1)) as ((reason: FooError) => CancelablePromise<string, BarError>) | null;
    const _maybeFailing = pFoo.catch(maybeFailing);
    const cMaybeFailing: Eq<typeof _maybeFailing, CancelablePromise<number | string, FooError | BarError>> = true;

    void [cNone, cNull, cUndef, cMaybe, cMaybeFailing];

    const fooError = new FooError();
    const rejected = CancelablePromise.reject(fooError) as CancelablePromise<number, FooError>;

    await expect(rejected.catch()).rejects.toBe(fooError);
  });

  it('types static combinators and helpers correctly', () => {
    // p10-statics.ts
    const _r1 = CancelablePromise.resolve(pFoo);
    const c1: Eq<typeof _r1, CancelablePromise<number, FooError>> = true;

    const _r2 = CancelablePromise.resolve(42);
    const c2: Eq<typeof _r2, CancelablePromise<number, never>> = true;

    const _r3 = CancelablePromise.resolve(plainBool);
    const c3: Eq<typeof _r3, CancelablePromise<boolean, Unlisted>> = true;

    const _rNoArg = CancelablePromise.resolve();
    const cNoArg: Eq<typeof _rNoArg, CancelablePromise<void, never>> = true;

    const _r4 = null as any as CancelablePromise<never, FooError>;
    const c4: Eq<typeof _r4, CancelablePromise<never, FooError>> = true;

    const _r5 = CancelablePromise.try(() => pFoo);
    const c5: Eq<typeof _r5, CancelablePromise<number, FooError>> = true;

    // Tuple overloads at arity 2, 3, 5
    const _rAll2 = CancelablePromise.all([pFoo, pBar]);
    const cAll2: Eq<typeof _rAll2, CancelablePromise<[number, string], FooError | BarError>> = true;

    const _rAll3 = CancelablePromise.all([pFoo, pBar, plainBool]);
    const cAll3: Eq<typeof _rAll3, CancelablePromise<[number, string, boolean], FooError | BarError | Unlisted>> = true;

    const _rAll5 = CancelablePromise.all([pFoo, pBar, pFoo, pBar, plainBool]);
    const cAll5: Eq<
      typeof _rAll5,
      CancelablePromise<[number, string, number, string, boolean], FooError | BarError | Unlisted>
    > = true;

    // Iterable fallback (TAll inferred as number via PromiseLike<TAll>, FailureOf<number> = never)
    const iter = [pFoo] as Iterable<CancelablePromise<number, FooError>>;
    const _rAllIter = CancelablePromise.all(iter);
    const cAllIter: Eq<typeof _rAllIter, CancelablePromise<number[], never>> = true;

    const _rRace = CancelablePromise.race([pFoo, pBar]);
    const cRace: Eq<typeof _rRace, CancelablePromise<number | string, FooError | BarError>> = true;

    const _rSettled = CancelablePromise.allSettled([pFoo, pBar]);
    const cSettled: Eq<
      typeof _rSettled,
      CancelablePromise<[PromiseSettledResult<number>, PromiseSettledResult<string>], never>
    > = true;

    const _rAny = CancelablePromise.any([pFoo, pBar]);
    const cAny: Eq<typeof _rAny, CancelablePromise<number | string, AggregateError>> = true;

    const _rWR = CancelablePromise.withResolvers<number, FooError>();
    const cWR: Eq<typeof _rWR.promise, CancelablePromise<number, FooError>> = true;

    const v1: Promise<[number, string, boolean]> = CancelablePromise.all([pFoo, pBar, plainBool]);

    void [c1, c2, c3, cNoArg, c4, c5, cAll2, cAll3, cAll5, cAllIter, cRace, cSettled, cAny, cWR, v1];
  });

  it('types defaults and reason types correctly', () => {
    // p12-defaults.ts
    const pUntyped = CancelablePromise.resolve(1) as any as CancelablePromise<number>;
    const pTyped = CancelablePromise.resolve(1) as any as CancelablePromise<number, FooError>;
    const pTypedBoth = CancelablePromise.resolve(1) as any as CancelablePromise<number, FooError | BarError>;

    // @ts-expect-error An undeclared promise does not fit a declared failure slot
    const assign1: CancelablePromise<number, FooError> = pUntyped;
    // @ts-expect-error Narrowing failure set
    const assign2: CancelablePromise<number, never> = pTyped;

    pUntyped.catch((_e) => {
      const c: Eq<typeof _e, any> = true;
      void c;
      return 0;
    });

    pTyped.catch((_e) => {
      const c: Eq<typeof _e, FooError> = true;
      void c;
      return 0;
    });

    pTypedBoth.catch((_e) => {
      const c: Eq<typeof _e, FooError | BarError> = true;
      void c;
      return 0;
    });

    pTypedBoth.then(null, (_e) => {
      const c: Eq<typeof _e, FooError | BarError> = true;
      void c;
      return 0;
    });

    const widened: CancelablePromise<number, unknown> = pTyped;
    // @ts-expect-error Narrowing back
    const narrowedBack: CancelablePromise<number, FooError> = widened;

    void [assign1, assign2, widened, narrowedBack];
  });

  it('types executor rejection reason correctly', () => {
    const _p1 = new CancelablePromise<number, FooError>((_res, rej) => {
      rej(new FooError());
    });
    _p1.catch(() => {});
    const _p2 = new CancelablePromise<number, FooError>((_res, rej) => {
      rej(new CancelError());
    });
    _p2.catch(() => {});
    const _p3 = new CancelablePromise<number, FooError>((_res, rej) => {
      rej();
    });
    _p3.catch(() => {});

    const _p4 = new CancelablePromise<number, FooError>((_res, rej) => {
      // @ts-expect-error An undeclared reason is rejected in a user written executor
      rej(new BarError());
    });
    _p4.catch(() => {});

    void [_p1, _p2, _p3, _p4];
  });

  it('pins the throw hole and the reject idiom (chain-side twin of canc.throw)', () => {
    const bad = false;
    const p = CancelablePromise.resolve(1);

    // KNOWN LIMITATION, pinned on purpose: the failure computation reads a callback's RETURN
    // type, and a throw has no return type. `never` is correct here for a callback whose return
    // type is `number`, do not "fix" this to FooError, that would be wrong for every callback
    // that legitimately never fails. The defect this test exists to prevent is someone silently
    // "fixing" the never below.
    const thrown = p.then((v) => {
      if (bad) throw new FooError();
      return v;
    });
    const cThrown: Eq<FailureOf<typeof thrown>, never> = true;

    // The idiom: return a rejected promise instead of throwing.
    // This is the chain-side twin of
    // canc.throw inside a coroutine body, and it threads through ordinary then propagation.
    const rejected = p.then((v) => (bad ? CancelablePromise.reject(new FooError()) : v));
    const cRejected: Eq<FailureOf<typeof rejected>, FooError> = true;

    thrown.catch(() => {});
    rejected.catch(() => {});

    void [cThrown, cRejected];
  });

  it('treats an unknown rejection reason as no declared failure', () => {
    // An undeclared reason contributes nothing to the declared set: reject(new FooError()) is
    // unaffected, reject(unknown) collapses to never, and a selective-rethrow on an undeclared
    // promise no longer poisons the union with unknown.
    const rFoo = CancelablePromise.reject(new FooError());
    const cFoo: Eq<FailureOf<typeof rFoo>, FooError> = true;
    rFoo.catch(() => {});

    const unknownBinding = 1 as unknown;
    const rUnknown = CancelablePromise.reject(unknownBinding);
    const cUnknown: Eq<FailureOf<typeof rUnknown>, never> = true;
    rUnknown.catch(() => {});

    function isErrorOf<E extends new (...a: never[]) => Error>(e: unknown, ctor: E): e is InstanceType<E> {
      return e instanceof ctor;
    }
    const pUndeclared = CancelablePromise.resolve(1) as any as CancelablePromise<number>;
    const rRethrow = pUndeclared.catch((f) =>
      isErrorOf(f, FooError) ? CancelablePromise.reject(new BarError()) : CancelablePromise.reject(f),
    );
    const cRethrow: Eq<FailureOf<typeof rRethrow>, BarError> = true;
    rRethrow.catch(() => {});

    void [cFoo, cUnknown, cRethrow];
  });

  it('reads an open failure set as an untyped reason', () => {
    type IsAnyReason<T> = 0 extends 1 & T ? true : false;

    const open = CancelablePromise.resolve(1) as any as CancelablePromise<number, FooError | Unlisted>;
    open.catch((_e) => {
      const c: Eq<IsAnyReason<typeof _e>, true> = true;
      void c;
      return 0;
    });
    const cOpenSet: Eq<FailureOf<typeof open>, FooError | Unlisted> = true;

    const closed = CancelablePromise.resolve(1) as any as CancelablePromise<number, FooError>;
    closed.catch((_e) => {
      const c: Eq<typeof _e, FooError> = true;
      void c;
      return 0;
    });

    // a second structural copy of the marker, as a duplicated package install would carry
    interface UnlistedCopy {
      readonly _cancUnlisted: true;
    }
    const openCopy = CancelablePromise.resolve(1) as any as CancelablePromise<number, FooError | UnlistedCopy>;
    openCopy.catch((_e) => {
      const c: Eq<IsAnyReason<typeof _e>, true> = true;
      void c;
      return 0;
    });

    void cOpenSet;
  });

  it('reads a native promise as an open failure set', () => {
    type IsAnyReason<T> = 0 extends 1 & T ? true : false;
    const native = Promise.resolve(1);

    const cNative: Eq<FailureOf<Promise<number>>, Unlisted> = true;
    const cAny: Eq<FailureOf<any>, never> = true;

    const raceNative = CancelablePromise.race([pFoo, native]);
    const cRaceNative: Eq<FailureOf<typeof raceNative>, FooError | Unlisted> = true;
    raceNative.catch((_e) => {
      const c: Eq<IsAnyReason<typeof _e>, true> = true;
      void c;
      return 0;
    });

    const allNative = CancelablePromise.all([pFoo, native]);
    const cAllNative: Eq<FailureOf<typeof allNative>, FooError | Unlisted> = true;
    allNative.catch((_e) => {
      const c: Eq<IsAnyReason<typeof _e>, true> = true;
      void c;
      return 0;
    });

    const mixedList = [pFoo, native] as (CancelablePromise<number, FooError> | Promise<number>)[];
    CancelablePromise.race(mixedList).catch((_e) => {
      const c: Eq<IsAnyReason<typeof _e>, true> = true;
      void c;
      return 0;
    });

    const resolvedNative = CancelablePromise.resolve(native);
    const cResolvedNative: Eq<FailureOf<typeof resolvedNative>, Unlisted> = true;

    const wrappedNative = makeCancelable(native);
    const cWrappedNative: Eq<typeof wrappedNative, CancelablePromise<number, Unlisted>> = true;
    const wrappedFoo = makeCancelable(pFoo);
    const cWrappedFoo: Eq<typeof wrappedFoo, CancelablePromise<number, FooError>> = true;

    // a handler returning any declares nothing, so an empty set stays empty
    const pNever = CancelablePromise.resolve(1) as any as CancelablePromise<number, never>;
    const echoed = pNever.catch((e) => e);
    const cEchoed: Eq<FailureOf<typeof echoed>, never> = true;
    const castResult = pFoo.then((v) => v as any);
    const cCastResult: Eq<FailureOf<typeof castResult>, FooError> = true;

    const raceClosed = CancelablePromise.race([pFoo, CancelablePromise.resolve(1)]);
    const cRaceClosed: Eq<FailureOf<typeof raceClosed>, FooError> = true;

    raceNative.catch(() => {});
    allNative.catch(() => {});
    resolvedNative.catch(() => {});
    wrappedNative.catch(() => {});
    wrappedFoo.catch(() => {});
    echoed.catch(() => {});
    castResult.catch(() => {});
    raceClosed.catch(() => {});

    void [cNative, cAny, cRaceNative, cAllNative, cResolvedNative, cWrappedNative, cWrappedFoo, cEchoed];
    void [cCastResult, cRaceClosed];
  });

  it('leaves the resolvers reject open for internal producers', () => {
    const { promise, reject } = CancelablePromise.withResolvers<number, FooError>();

    // The producer handle forwards whatever a foreign body threw, so it takes any reason.
    reject(new BarError());
    reject('a string');
    promise.catch(() => {});

    const check: Eq<Parameters<typeof reject>, [reason?: any]> = true;
    void check;
  });
});
