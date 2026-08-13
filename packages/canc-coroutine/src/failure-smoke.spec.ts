import { CancelablePromise, FailureOf, isErrorOf } from '@cancjs/promise';

import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import { BreakError, cancAsync, cancAwait, cancForAwait, cancThrow } from './coroutine';
import { cancGenAsync, cancGenAwait, cancGenForAwait, cancGenThrow } from './coroutine-gen';

class FooError extends Error {
  readonly name = 'FooError';
  readonly __foo = true;
}

class BarError extends Error {
  readonly name = 'BarError';
  readonly __bar = true;
}

class BazError extends Error {
  readonly name = 'BazError';
  readonly __baz = true;
}

function produceFoo(fail: boolean): CancelablePromise<number, FooError> {
  return new CancelablePromise((resolve, reject) => {
    if (fail) {
      reject(new FooError('foo error'));
    } else {
      resolve(42);
    }
  });
}

function produceBar(fail: boolean): CancelablePromise<string, BarError> {
  return new CancelablePromise((resolve, reject) => {
    if (fail) {
      reject(new BarError('bar error'));
    } else {
      resolve('hello');
    }
  });
}

const innerCoroutine = cancAsync(function* (failFoo: boolean, failBar: boolean, failBaz: boolean) {
  let num = 0;
  try {
    num = yield* cancAwait(produceFoo(failFoo));
  } catch (err: unknown) {
    if (isErrorOf(err, FooError)) {
      num = -1;
    } else {
      throw err;
    }
  }

  const str = yield* cancAwait(produceBar(failBar));

  if (failBaz) {
    return yield* cancThrow(new BazError('baz error'));
  }

  let total = num + str.length;
  yield* cancForAwait([1, 2], (val: number) => {
    total += val;
  });

  return total;
});

type InnerReturnType = ReturnType<typeof innerCoroutine>;
const checkInnerType: Eq<
  InnerReturnType,
  CancelablePromise<number, FooError | BarError | BazError | BreakError>
> = true;

const outerCoroutine = cancAsync(function* (failFoo: boolean, failBar: boolean, failBaz: boolean) {
  try {
    const res = yield* cancAwait(innerCoroutine(failFoo, failBar, failBaz));
    return res;
  } catch (err: unknown) {
    if (isErrorOf(err, BarError)) {
      return -20;
    }
    if (isErrorOf(err, BazError)) {
      return -30;
    }
    if (isErrorOf(err, BreakError)) {
      return -40;
    }
    throw err;
  }
});

type OuterReturnType = ReturnType<typeof outerCoroutine>;
const checkOuterType: Eq<
  OuterReturnType,
  CancelablePromise<number, FooError | BarError | BazError | BreakError>
> = true;

const producerGen = cancGenAsync(function* (failBar: boolean, failBaz: boolean) {
  const num = yield* cancGenAwait(produceFoo(false));
  yield num;

  const str = yield* cancGenAwait(produceBar(failBar));
  yield str.length;

  if (failBaz) {
    yield* cancGenThrow(new BazError('gen baz error'));
  }

  yield* cancGenForAwait([100, 200], function* (item: number) {
    yield item;
  });
});

type GenReturnType = ReturnType<typeof producerGen>;
type GenFailures = FailureOf<GenReturnType>;
const checkGenFailures: Eq<GenFailures, FooError | BarError | BazError | BreakError> = true;

const consumerGen = async (failBar: boolean, failBaz: boolean) => {
  const items: (number | string)[] = [];
  try {
    for await (const item of producerGen(failBar, failBaz)) {
      items.push(item);
    }
  } catch (err: unknown) {
    if (isErrorOf(err, BarError)) {
      items.push('bar-recovered');
    } else if (isErrorOf(err, BazError)) {
      items.push('baz-recovered');
    } else {
      throw err;
    }
  }
  return items;
};

describe('declared failure smoke coverage', () => {
  it('verifies module-level type equivalence checks', () => {
    expect(checkInnerType).toBe(true);
    expect(checkOuterType).toBe(true);
    expect(checkGenFailures).toBe(true);
  });

  describe('coroutine dialect', () => {
    it('executes success path end-to-end', async () => {
      const res = await outerCoroutine(false, false, false);
      expect(res).toBe(50);
    });

    it('recovers FooError inside inner coroutine using core isErrorOf', async () => {
      const res = await outerCoroutine(true, false, false);
      expect(res).toBe(7);
    });

    it('propagates BarError to outer coroutine handler', async () => {
      const res = await outerCoroutine(false, true, false);
      expect(res).toBe(-20);
    });

    it('propagates BazError from cancThrow to outer coroutine handler', async () => {
      const res = await outerCoroutine(false, false, true);
      expect(res).toBe(-30);
    });
  });

  describe('async-generator dialect', () => {
    it('emits items end-to-end on success path', async () => {
      const items = await consumerGen(false, false);
      expect(items).toEqual([42, 5, 100, 200]);
    });

    it('handles BarError in consumer for-await loop', async () => {
      const items = await consumerGen(true, false);
      expect(items).toEqual([42, 'bar-recovered']);
    });

    it('handles BazError from cancGenThrow in consumer for-await loop', async () => {
      const items = await consumerGen(false, true);
      expect(items).toEqual([42, 5, 'baz-recovered']);
    });
  });
});
