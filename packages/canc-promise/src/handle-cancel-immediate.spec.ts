import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';
import { isCancelError } from './helpers';

/**
 * handleCancel immediate-fire opt-in.
 *
 * Default is unchanged: registering handleCancel on an already-canceled promise is a silent no-op
 * (strict → throw). Opt-in `handleCancel(fn, { immediate: true })` fires `fn` on an already-canceled
 * promise, asynchronously (microtask) with the ORIGINAL cancel reason. The immediate opt-in also
 * suppresses the strict throw for that call.
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 10));
}

describe('handleCancel immediate opt-in', () => {
  it('default: handleCancel on already-canceled promise is a silent no-op', async () => {
    let fired = false;
    const promise = new CancelablePromise<number>(() => {
      /**/
    });
    promise.cancel('stop');

    promise.handleCancel(() => {
      fired = true;
    });

    await macrotask();
    expect(fired).toBe(false);
  });

  it('default: handleCancel while pending still fires normally on later cancel', async () => {
    const seen: any[] = [];
    const promise = new CancelablePromise<number>(() => {
      /**/
    });

    promise.handleCancel((reason) => {
      seen.push(reason);
    });
    promise.cancel(new CancelError('later'));

    await macrotask();
    expect(seen.length).toBe(1);
    expect(isCancelError(seen[0])).toBe(true);
  });

  it('immediate: fires on an already-canceled promise with the original reason', async () => {
    const seen: any[] = [];
    const reason = new CancelError('gone');
    const promise = new CancelablePromise<number>(() => {
      /**/
    });
    promise.cancel(reason);

    promise.handleCancel(
      (r) => {
        seen.push(r);
      },
      { immediate: true },
    );

    await macrotask();
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(reason);
  });

  it('immediate: original reason is a string when canceled with a string', async () => {
    let received: any;
    const promise = new CancelablePromise<number>(() => {
      /**/
    });
    promise.cancel('by-string');

    promise.handleCancel(
      (r) => {
        received = r;
      },
      { immediate: true },
    );

    await macrotask();
    expect(received).toBe('by-string');
  });

  it('immediate: fire is ASYNCHRONOUS (microtask), not synchronous', async () => {
    const order: string[] = [];
    const promise = new CancelablePromise<number>(() => {
      /**/
    });
    promise.cancel('stop');

    promise.handleCancel(
      () => {
        order.push('handler');
      },
      { immediate: true },
    );
    order.push('after-register');

    expect(order).toEqual(['after-register']); // handler has NOT run synchronously

    await macrotask();
    expect(order).toEqual(['after-register', 'handler']);
  });

  it('immediate on a still-pending promise = normal registration (fires once on later cancel)', async () => {
    let count = 0;
    const promise = new CancelablePromise<number>(() => {
      /**/
    });

    promise.handleCancel(
      () => {
        count++;
      },
      { immediate: true },
    );

    expect(count).toBe(0); // not fired yet — still pending
    promise.cancel('stop');

    await macrotask();
    expect(count).toBe(1); // fired exactly once, not twice
  });

  it('immediate suppresses the strict throw on an already-canceled promise', async () => {
    let fired = false;
    const promise = new CancelablePromise<number>(
      () => {
        /**/
      },
      { strict: true },
    );
    promise.cancel('stop');

    expect(() =>
      promise.handleCancel(
        () => {
          fired = true;
        },
        { immediate: true },
      ),
    ).not.toThrow();

    await macrotask();
    expect(fired).toBe(true);
  });

  it('strict WITHOUT immediate still throws on an already-canceled promise', () => {
    const promise = new CancelablePromise<number>(
      () => {
        /**/
      },
      { strict: true },
    );
    promise.cancel('stop');

    expect(() =>
      promise.handleCancel(() => {
        /**/
      }),
    ).toThrow();
  });

  it('immediate on an already-FULFILLED promise does NOT fire (only canceled)', async () => {
    let fired = false;
    const promise = new CancelablePromise<number>((resolve) => resolve(1));
    await promise;

    promise.handleCancel(
      () => {
        fired = true;
      },
      { immediate: true },
    );

    await macrotask();
    expect(fired).toBe(false);
  });

  it('handleCancel returns the promise (chainable) with immediate option', () => {
    const promise = new CancelablePromise<number>(() => {
      /**/
    });
    promise.cancel('stop');
    const ret = promise.handleCancel(
      () => {
        /**/
      },
      { immediate: true },
    );
    expect(ret).toBe(promise);
  });
});
