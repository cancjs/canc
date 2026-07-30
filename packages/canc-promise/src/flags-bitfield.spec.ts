import { CancelablePromise } from './cancelable-promise';

/**
 * The five cancelation flags (asyncCancel/forceCancelable/bubble/strict/shield) are stored in a
 * packed integer, exposed through prototype getter/setters. These assert the public read/write API
 * is preserved: constructor options land on the getters, and post-construction writes flip a single
 * bit without disturbing the others.
 */
describe('flag bitfield accessors', () => {
  it('reads flag options set through the constructor', () => {
    const p = new CancelablePromise(
      () => {
        /**/
      },
      {
        asyncCancel: false,
        forceCancelable: false,
        bubble: false,
        strict: false,
        shield: true,
      },
    );

    expect(p.asyncCancel).toBe(false);
    expect(p.forceCancelable).toBe(false);
    expect(p.bubble).toBe(false);
    expect(p.strict).toBe(false);
    expect(p.shield).toBe(true);

    p.cancel();
  });

  it('defaults match defaultOptions', () => {
    const p = new CancelablePromise(() => {
      /**/
    });

    expect(p.options).toEqual({
      asyncCancel: true,
      forceCancelable: true,
      bubble: true,
      strict: false,
      shield: false,
    });

    p.cancel();
  });

  it('writing a flag flips only that bit', () => {
    const p = new CancelablePromise(() => {
      /**/
    });

    // set true -> false, one flag at a time, others unchanged
    p.asyncCancel = false;
    expect(p.asyncCancel).toBe(false);
    expect(p.forceCancelable).toBe(true);

    p.forceCancelable = false;
    expect(p.forceCancelable).toBe(false);
    expect(p.bubble).toBe(true);

    p.bubble = false;
    expect(p.bubble).toBe(false);

    // set false -> true
    p.strict = true;
    expect(p.strict).toBe(true);

    p.shield = true;
    expect(p.shield).toBe(true);
    // prior writes still hold
    expect(p.asyncCancel).toBe(false);
    expect(p.forceCancelable).toBe(false);
    expect(p.bubble).toBe(false);

    p.shield = false;
    p.cancel();
  });
});
