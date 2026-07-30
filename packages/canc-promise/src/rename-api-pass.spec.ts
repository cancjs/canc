import { CancelError } from './cancel-error';
import { CancelablePromise, ICancelableHelperOptions } from './cancelable-promise';
import { isCancPromise, makeCancelable } from './helpers';

/**
 * Owner's rename pass: new primary names + deprecation aliases for the old names.
 *
 * Covers: canceled/cancelable getters (new primary + old alias still works), bubbled field on
 * CancelError (new primary + old alias getter/setter), options getter, Promise.try static,
 * isCancPromise duck-token helper, makeCancelable (renamed forceCancelable helper) + alias,
 * ICancelableHelperOptions custom-constructor injection.
 */

describe('rename pass: CancelablePromise.canceled / .cancelable', () => {
  it('canceled is the primary name and reflects state', async () => {
    const promise = new CancelablePromise(() => {
      /**/
    });
    expect(promise.canceled).toBe(false);

    promise.cancel();
    await promise.catch(() => {
      /**/
    });
    expect(promise.canceled).toBe(true);
  });

  it('isCanceled alias still works and mirrors canceled', async () => {
    const promise = new CancelablePromise(() => {
      /**/
    });
    expect(promise.isCanceled).toBe(promise.canceled);

    promise.cancel();
    await promise.catch(() => {
      /**/
    });
    expect(promise.isCanceled).toBe(true);
    expect(promise.isCanceled).toBe(promise.canceled);
  });

  it('cancelable is the primary name and reflects state', () => {
    const promise = new CancelablePromise(() => {
      /**/
    });
    expect(promise.cancelable).toBe(true);

    promise.cancel();
    expect(promise.cancelable).toBe(false);
    promise.catch(() => {
      /**/
    });
  });

  it('isCancelable alias still works and mirrors cancelable', () => {
    const promise = new CancelablePromise(() => {
      /**/
    });
    expect(promise.isCancelable).toBe(promise.cancelable);

    promise.cancel();
    expect(promise.isCancelable).toBe(false);
    expect(promise.isCancelable).toBe(promise.cancelable);
    promise.catch(() => {
      /**/
    });
  });
});

describe('rename pass: CancelError.bubbled', () => {
  it('bubbled is the primary field, defaults false', () => {
    const error = new CancelError('reason');
    expect(error.bubbled).toBe(false);
  });

  it('isBubbled alias getter/setter still works and mirrors bubbled', () => {
    const error = new CancelError('reason');
    expect(error.isBubbled).toBe(false);

    error.isBubbled = true;
    expect(error.isBubbled).toBe(true);
    expect(error.bubbled).toBe(true);

    error.bubbled = false;
    expect(error.isBubbled).toBe(false);
  });
});

describe('rename pass: options getter', () => {
  it('reflects the active flag options as a plain snapshot', () => {
    const promise = new CancelablePromise(
      () => {
        /**/
      },
      { bubble: false, strict: true },
    );

    expect(promise.options).toEqual({
      asyncCancel: true,
      forceCancelable: true,
      bubble: false,
      strict: true,
      shield: false,
    });

    promise.catch(() => {
      /**/
    });
  });
});

describe('rename pass: Promise.try static', () => {
  it('wraps a synchronous return value in a resolved CancelablePromise', async () => {
    const result = await CancelablePromise.try(() => 42);
    expect(result).toBe(42);
  });

  it('wraps a synchronous throw into a rejection instead of throwing', async () => {
    await expect(
      CancelablePromise.try(() => {
        throw new Error('sync boom');
      }),
    ).rejects.toThrow('sync boom');
  });

  it('adopts a returned thenable', async () => {
    const result = await CancelablePromise.try((value: number) => Promise.resolve(value * 2), 21);
    expect(result).toBe(42);
  });
});

describe('rename pass: isCancPromise duck-token', () => {
  it('recognizes a genuine CancelablePromise instance', () => {
    const promise = new CancelablePromise(() => {
      /**/
    });
    expect(isCancPromise(promise)).toBe(true);
    promise.cancel();
    promise.catch(() => {
      /**/
    });
  });

  it('rejects a plain native Promise', () => {
    expect(isCancPromise(Promise.resolve(1))).toBe(false);
  });

  it('rejects non-thenable values', () => {
    expect(isCancPromise(null)).toBe(false);
    expect(isCancPromise(undefined)).toBe(false);
    expect(isCancPromise({})).toBe(false);
    expect(isCancPromise(42)).toBe(false);
  });
});

describe('rename pass: makeCancelable (renamed forceCancelable helper)', () => {
  it('wraps a plain promise into a cancelable one', async () => {
    const wrapped = makeCancelable(Promise.resolve(1));
    expect(isCancPromise(wrapped)).toBe(true);
    await expect(wrapped).resolves.toBe(1);
  });

  it('accepts a custom CancelablePromise-compatible constructor via ICancelableHelperOptions', async () => {
    let used = false;

    class CustomCancelablePromise extends (CancelablePromise as any) {
      constructor(...args: any[]) {
        used = true;
        super(...args);
      }
    }

    const options: ICancelableHelperOptions = { CancelablePromise: CustomCancelablePromise as any };
    const wrapped = makeCancelable(Promise.resolve(1), options);

    await expect(wrapped).resolves.toBe(1);
    expect(used).toBe(true);
  });
});
