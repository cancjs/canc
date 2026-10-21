import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { cancAsync } from './coroutine';

const handlerCount = (promise: CancelablePromise<any>): number =>
  ((promise as any)._cancelHandlers as unknown[] | undefined)?.length ?? 0;

describe('coroutine step cancel handlers', () => {
  it('keeps the coroutine promise handler count flat across 10k yields', async () => {
    const ref: { outer?: CancelablePromise<number> } = {};
    const co = cancAsync(function* () {
      for (let i = 0; i < 10000; i++) {
        yield CancelablePromise.resolve(i);
      }

      return handlerCount(ref.outer!);
    });

    ref.outer = co();

    expect(await ref.outer).toBeLessThanOrEqual(2);
  });

  it('keeps the count flat for plain value yields', async () => {
    const ref: { outer?: CancelablePromise<number> } = {};
    const co = cancAsync(function* () {
      for (let i = 0; i < 10000; i++) {
        yield i;
      }

      return handlerCount(ref.outer!);
    });

    ref.outer = co();

    expect(await ref.outer).toBeLessThanOrEqual(2);
  });

  it('retains no step handlers once a held coroutine promise has finished', async () => {
    const co = cancAsync(function* () {
      for (let i = 0; i < 1000; i++) {
        yield CancelablePromise.resolve(i);
      }

      return 'done';
    });
    const held = co();

    await expect(held).resolves.toBe('done');
    expect(handlerCount(held)).toBeLessThanOrEqual(2);
  });

  it('still cancels the in-flight step when the coroutine is canceled mid-run', async () => {
    let stepCanceled = false;
    let reached!: () => void;
    const atPending = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const co = cancAsync(function* () {
      for (let i = 0; i < 100; i++) {
        yield CancelablePromise.resolve(i);
      }

      reached();
      yield new CancelablePromise<void>((_resolve, _reject, { handleCancel }) => {
        handleCancel(() => {
          stepCanceled = true;
        });
      });
    });
    const running = co();

    await atPending;
    running.cancel();

    const error = await running.then(
      () => undefined,
      (err: unknown) => err,
    );

    expect(isCancelError(error)).toBe(true);
    expect(stepCanceled).toBe(true);
  });
});
