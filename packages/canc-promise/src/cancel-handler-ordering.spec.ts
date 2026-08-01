import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';

/**
 * Invocation-ORDER contract for cancel handlers (option (a),
 * synchronous handler invocation on every cancel path).
 *
 * These pin the START time of a registered cancel handler relative to the code
 * that triggers the cancel cascade, and assert that the start time does NOT
 * depend on which path canceled the promise (explicit cancel() vs bubble-cancel
 * vs an upstream/external rejection). Before option (a) the bubble/external
 * discard-return path deferred handlers to a microtask, so the bubble-cancel
 * cases here failed while the explicit-cancel case passed.
 *
 * Bubble note: attaching a rejection sink (`.catch`) to a bubble-capable parent
 * BEFORE the bubble registers a live never-canceling consumer that blocks the
 * upward bubble. So the parent is silenced only AFTER the bubble has fired.
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 10));
}

function silence(p: CancelablePromise<any>): void {
  p.catch(() => {
    /**/
  });
}

describe('cancel handler invocation ordering', () => {
  it('explicit cancel(): handler starts synchronously, before the line after cancel()', () => {
    const order: string[] = [];

    const promise = new CancelablePromise((_resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        order.push('handler');
      });
    });
    silence(promise);

    order.push('before-cancel');
    promise.cancel('reason');
    order.push('after-cancel');

    expect(order).toEqual(['before-cancel', 'handler', 'after-cancel']);
  });

  it('bubble-cancel: parent handler starts synchronously inside the child cancel() call', () => {
    const order: string[] = [];

    const parent = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        order.push('parent-handler');
      });
    });
    const child = parent.then((v) => v);
    silence(child);

    order.push('before-child-cancel');
    child.cancel('done');
    order.push('after-child-cancel');
    silence(parent); // silence the now-bubbled parent, after the bubble fired

    // The bubble drives parent.cancel() synchronously inside child.cancel(), so the
    // parent cancel handler fires between the two markers (option (a)). Pre-fix it
    // was deferred to a microtask and landed after 'after-child-cancel'.
    expect(order).toEqual(['before-child-cancel', 'parent-handler', 'after-child-cancel']);
  });

  it('explicit-cancel and bubble-cancel agree: both start the handler synchronously (no path split)', () => {
    // explicit path
    const explicitOrder: string[] = [];
    const target = new CancelablePromise((_r, _j, { handleCancel }) => {
      handleCancel(() => {
        explicitOrder.push('handler');
      });
    });
    silence(target);
    explicitOrder.push('trigger');
    target.cancel();
    explicitOrder.push('after');
    expect(explicitOrder.indexOf('handler')).toBeGreaterThan(explicitOrder.indexOf('trigger'));
    expect(explicitOrder.indexOf('handler')).toBeLessThan(explicitOrder.indexOf('after'));

    // bubble path
    const bubbleOrder: string[] = [];
    const parent = new CancelablePromise<number>((_r, _j, { handleCancel }) => {
      handleCancel(() => {
        bubbleOrder.push('handler');
      });
    });
    const child = parent.then((v) => v);
    silence(child);
    bubbleOrder.push('trigger');
    child.cancel();
    bubbleOrder.push('after');
    silence(parent);
    expect(bubbleOrder.indexOf('handler')).toBeGreaterThan(bubbleOrder.indexOf('trigger'));
    expect(bubbleOrder.indexOf('handler')).toBeLessThan(bubbleOrder.indexOf('after'));
  });

  it('discard path swallows a throwing handler (no unhandled rejection) and does not throw out of cancel()', async () => {
    const parent = new CancelablePromise<number>((_r, _j, { handleCancel }) => {
      handleCancel(() => {
        throw new Error('boom');
      });
    });
    const child = parent.then((v) => v);
    silence(child);

    // Bubble triggers the parent's throwing handler on the discard path.
    expect(() => child.cancel()).not.toThrow();
    silence(parent);
    await macrotask();
  });

  it('discard path absorbs a thenable handler result (rejected thenable does not go unhandled)', async () => {
    let rejectHandlerPromise: (e: unknown) => void = () => {
      /**/
    };
    // Register the thenable-returning handler on a CHILD canceled by upstream
    // (external) rejection, so the discard-return branch of _runCancellation runs
    // (the bubble path routes through the consumed cancel() instead).
    const parent = new CancelablePromise<number>(() => {
      /* pending */
    });
    const child = parent.then((v) => v);
    child.handleCancel(
      () =>
        new NativePromise((_res, rej) => {
          rejectHandlerPromise = rej;
        }),
    );
    silence(child);
    silence(parent);

    parent.cancel('stop');
    await macrotask(); // let the rejection propagate down and run the child handler
    // Reject the handler's returned thenable; the discard path attached a noop
    // rejection reaction, so this must not produce an unhandled rejection.
    rejectHandlerPromise(new Error('late'));
    await macrotask();
  });

  it('external upstream cancel: child handler fires in the same reject reaction, before the child catch', async () => {
    const order: string[] = [];

    const parent = new CancelablePromise<number>(() => {
      /* pending */
    });
    const child = parent.then((v) => v);
    child.handleCancel(() => {
      order.push('child-handler');
    });
    child.catch(() => order.push('child-catch'));
    silence(parent);

    order.push('before');
    parent.cancel('stop');
    order.push('after-parent-cancel');

    // Parent's own cancel is synchronous; the child's cancel arrives on a microtask
    // via the native reject reaction. Under option (a) the child's cancel HANDLER runs
    // synchronously inside that reject reaction, i.e. BEFORE the child's own `.catch`
    // observes the rejection and before the next microtask tick. Under the deferred
    // (microtask) semantics the handler landed one microtask later, after the catch.
    expect(order).toEqual(['before', 'after-parent-cancel']);

    // Drain enough microtask ticks to let both the handler and the catch run, then pin
    // their relative order: handler strictly before the child's catch observation.
    await macrotask();

    expect(order).toContain('child-handler');
    expect(order).toContain('child-catch');
    expect(order.indexOf('child-handler')).toBeLessThan(order.indexOf('child-catch'));
  });

  it('sync mode (asyncCancel:false) bubble-cancel still fires handler synchronously', () => {
    const order: string[] = [];
    const parent = new CancelablePromise<number>(
      (_r, _j, { handleCancel }) => {
        handleCancel(() => {
          order.push('handler');
        });
      },
      { asyncCancel: false },
    );
    const child = parent.then((v) => v);
    silence(child);

    order.push('trigger');
    child.cancel();
    order.push('after');
    silence(parent);
    expect(order).toEqual(['trigger', 'handler', 'after']);
  });

  it('bubbled reason reaches the parent cancel handler', () => {
    let received: unknown;
    const parent = new CancelablePromise<number>((_r, _j, { handleCancel }) => {
      handleCancel((reason) => {
        received = reason;
      });
    });
    const child = parent.then((v) => v);
    silence(child);

    child.cancel();
    silence(parent);
    expect(received).toBeInstanceOf(CancelError);
    expect((received as CancelError).bubbled).toBe(true);
  });
});
