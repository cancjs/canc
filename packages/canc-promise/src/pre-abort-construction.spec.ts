import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';

/**
 * Pre-aborted signal construction rework.
 *
 * Guards the interaction of three features that individually work but collided: pre-aborted
 * signal handling, synchronous settler-release (settled promises drop their _resolve/_reject),
 * and the post-construct field copy from the temporary constructor `this` to the real instance.
 *
 * (a) withResolvers over a pre-aborted signal still hands out usable resolve/reject wrappers.
 * (b) sync-settled promises release their settlers (no re-pinning regression).
 * (c) async-settled promises release their settlers.
 * (d) strict + pre-aborted throws AND the executor never runs.
 * (e) non-strict + pre-aborted never runs the executor and the promise is born canceled with
 * signal.reason preserved as cause.
 */

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function preAborted(reason?: any): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason);
  return controller.signal;
}

describe('pre-abort construction rework', () => {
  // withResolvers must return callable settlers, not undefined.
  it('(a) withResolvers over a pre-aborted signal hands out callable resolve/reject', async () => {
    const { promise, resolve, reject } = CancelablePromise.withResolvers<number>({
      signal: preAborted(new Error('gone')),
    });

    expect(typeof resolve).toBe('function');
    expect(typeof reject).toBe('function');
    expect(promise.canceled).toBe(true);
    // reject on an already-canceled promise must be a safe no-op, never a TypeError from
    // calling `undefined`.
    expect(() => reject(new Error('late'))).not.toThrow();

    await promise.catch(() => {
      /**/
    });
  });

  // a synchronously-settled promise releases its settlers after settle.
  it('(b) sync-settled promise releases _resolve/_reject', async () => {
    const promise = CancelablePromise.resolve(1);

    await promise;

    expect((promise as any)._resolve).toBeUndefined();
    expect((promise as any)._reject).toBeUndefined();
  });

  // (c) async-settled variant of the same retention check.
  it('(c) async-settled promise releases _resolve/_reject', async () => {
    const promise = new CancelablePromise<number>((resolve) => {
      setTimeout(() => resolve(2), 0);
    });

    await flushPromises();
    await promise;

    expect((promise as any)._resolve).toBeUndefined();
    expect((promise as any)._reject).toBeUndefined();
  });

  // strict + pre-aborted throws, executor must never run.
  it('(d) strict + pre-aborted throws and never runs the executor', () => {
    const executor = jest.fn();

    expect(() => {
      new CancelablePromise(executor, { signal: preAborted(), strict: true });
    }).toThrow(/[Aa]borted/);

    expect(executor).not.toHaveBeenCalled();
  });

  // (e) non-strict + pre-aborted: executor never runs, promise born canceled, reason as cause.
  it('(e) non-strict + pre-aborted never runs the executor and preserves signal.reason', async () => {
    const executor = jest.fn();
    const reason = new Error('abort-cause');

    const promise = new CancelablePromise(executor, { signal: preAborted(reason) });

    expect(executor).not.toHaveBeenCalled();
    expect(promise.canceled).toBe(true);

    let caught: any = null;
    promise.catch((err: any) => {
      caught = err;
    });

    await flushPromises();

    expect(caught).toBeInstanceOf(CancelError);
    expect(caught.cause).toBe(reason);
  });
});
