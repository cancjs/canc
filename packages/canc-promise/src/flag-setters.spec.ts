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

  it('balances the chain count in both toggle directions', async () => {
    const parent = new CancelablePromise<void>(() => {
      /**/
    });
    const first = parent.then(() => undefined);
    parent.bubble = false;
    parent.then(() => undefined);
    parent.bubble = true;
    const third = parent.then(() => undefined);

    first.cancel();
    await settle();
    expect(parent.canceled).toBe(false);

    third.cancel();
    await settle();
    expect(parent.canceled).toBe(true);
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
});
