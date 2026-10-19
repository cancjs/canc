import { CancelablePromise } from './cancelable-promise';

// bubble-cancel is decided a couple of microtasks after the child cancels, so wait for it
const settle = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Flag setters (`bubble`, `forceCancelable`, ...) change only the edges created after the write.
 * An edge snapshots the parent's flags when the child is chained, and completes by that snapshot.
 */
describe('flag setters apply to later chain edges only', () => {
  it('keeps bubbling for an edge created while bubble was on, after bubble is turned off', async () => {
    const parent = new CancelablePromise<void>(() => {
      /**/
    });
    const child = parent.then(() => undefined);

    parent.bubble = false;
    child.cancel();
    await settle();

    expect(parent.canceled).toBe(true);
  });

  it('does not bubble for an edge created while bubble was off, after bubble is turned on', async () => {
    const parent = new CancelablePromise<void>(
      () => {
        /**/
      },
      { bubble: false },
    );
    const child = parent.then(() => undefined);

    parent.bubble = true;
    child.cancel();
    await settle();

    expect(parent.canceled).toBe(false);
  });

  it('applies the new bubble value to an edge created after the write', async () => {
    const parent = new CancelablePromise<void>(() => {
      /**/
    });
    parent.bubble = false;
    const child = parent.then(() => undefined);

    child.cancel();
    await settle();

    expect(parent.canceled).toBe(false);
  });

  it('keeps a live consumer chained while bubble was off when bubble is turned on', async () => {
    const parent = new CancelablePromise<void>(
      () => {
        /**/
      },
      { bubble: false },
    );
    const consumer = parent.then(() => undefined);
    parent.bubble = true;
    const later = parent.then(() => undefined);

    later.cancel();
    await settle();

    expect(parent.canceled).toBe(false);
    expect(consumer.canceled).toBe(false);
  });

  it('keeps a live consumer chained after bubble is turned off when an earlier one cancels', async () => {
    const parent = new CancelablePromise<void>(() => {
      /**/
    });
    const earlier = parent.then(() => undefined);
    parent.bubble = false;
    const consumer = parent.then(() => undefined);

    earlier.cancel();
    await settle();

    expect(parent.canceled).toBe(false);
    expect(consumer.canceled).toBe(false);
  });

  it('keeps the parent and a live middle consumer when the edges around it cancel', async () => {
    let resolveParent!: () => void;
    const parent = new CancelablePromise<void>((resolve) => {
      resolveParent = resolve;
    });
    const first = parent.then(() => undefined);
    parent.bubble = false;
    const second = parent.then(() => 'second');
    parent.bubble = true;
    const third = parent.then(() => undefined);

    first.cancel();
    third.cancel();
    await settle();

    expect(parent.canceled).toBe(false);
    expect(second.canceled).toBe(false);
    resolveParent();
    await expect(second).resolves.toBe('second');
  });

  it('bubbles once every edge is canceled and the last one was created while bubble was on', async () => {
    const parent = new CancelablePromise<void>(() => {
      /**/
    });
    const first = parent.then(() => undefined);
    parent.bubble = false;
    const second = parent.then(() => undefined);
    parent.bubble = true;
    const third = parent.then(() => undefined);

    first.cancel();
    second.cancel();
    await settle();
    expect(parent.canceled).toBe(false);

    third.cancel();
    await settle();
    expect(parent.canceled).toBe(true);
  });

  it('balances the chain count in both toggle directions', async () => {
    // false -> true: the earlier edge is uncounted, so canceling the counted one must not cancel it
    const falseToTrue = new CancelablePromise<void>(() => {
      /**/
    });
    falseToTrue.bubble = false;
    const liveEarlier = falseToTrue.then(() => undefined);
    falseToTrue.bubble = true;
    const countedLater = falseToTrue.then(() => undefined);

    countedLater.cancel();
    await settle();

    expect(liveEarlier.canceled).toBe(false);
    expect(falseToTrue.canceled).toBe(false);

    // true -> false: the counted edge cancels, and the later uncounted edge keeps the parent alive
    const trueToFalse = new CancelablePromise<void>(() => {
      /**/
    });
    const countedEarlier = trueToFalse.then(() => undefined);
    trueToFalse.bubble = false;
    const liveLater = trueToFalse.then(() => undefined);

    countedEarlier.cancel();
    await settle();

    expect(trueToFalse.canceled).toBe(false);
    expect(liveLater.canceled).toBe(false);
  });

  it('never bubbles from a promise created with bubble false', async () => {
    const parent = new CancelablePromise<void>(
      () => {
        /**/
      },
      { bubble: false },
    );
    const children = [parent.then(), parent.then(), parent.then()];

    for (const child of children) {
      void child.cancel();
    }
    await settle();

    expect(parent.canceled).toBe(false);
    expect(parent.cancelable).toBe(true);
  });

  it('bubbles from a promise created with bubble true once every child is canceled', async () => {
    const parent = new CancelablePromise<void>(() => {
      /**/
    });
    const children = [parent.then(), parent.then()];

    for (const child of children) {
      void child.cancel();
    }
    await settle();

    expect(parent.canceled).toBe(true);
  });

  it('does not cancel a race input created with bubble false when the result is canceled', async () => {
    const input = new CancelablePromise<void>(
      () => {
        /**/
      },
      { bubble: false },
    );
    const result = CancelablePromise.race([input]);

    result.cancel();
    await settle();

    expect(result.canceled).toBe(true);
    expect(input.canceled).toBe(false);
    expect(input.cancelable).toBe(true);
  });

  it('ignores a forceCancelable write made after a new promise is created', async () => {
    let resolveOuter!: (value: unknown) => void;
    const direct = new CancelablePromise<number>((resolve) => {
      resolveOuter = resolve as (value: unknown) => void;
    });

    direct.forceCancelable = false;
    resolveOuter(new Promise<number>(() => undefined));
    await settle();

    expect(direct.cancelable).toBe(true);
  });

  it('ignores a forceCancelable write made after a then child is created', async () => {
    const root = new CancelablePromise<number>((resolve) => resolve(1));
    const child = root.then(() => new Promise<number>(() => undefined));

    child.forceCancelable = false;
    await settle();

    expect(child.cancelable).toBe(true);
  });

  it('inherits a forceCancelable write made on the parent before a then child is created', async () => {
    const root = new CancelablePromise<number>((resolve) => resolve(1));
    root.forceCancelable = false;
    const child = root.then(() => new Promise<number>(() => undefined));

    await settle();

    expect(child.cancelable).toBe(false);
  });

  it('keeps the parent forceCancelable when a species getter calls then on another promise', async () => {
    const helper = new CancelablePromise<number>((resolve) => resolve(1));
    class Sub<T> extends CancelablePromise<T> {
      static get [Symbol.species]() {
        void helper.then(() => undefined);
        return Sub;
      }
    }
    const parent = new Sub<number>((resolve) => resolve(1), { forceCancelable: false });
    const child = parent.then(() => new Promise<number>(() => undefined));

    await settle();

    expect(child.cancelable).toBe(false);
  });
});
