import { CancelablePromise } from './cancelable-promise';

describe('allSettled iterator failure observation', () => {
  it('observes a rejected input before asking for another iterator value', async () => {
    const inner = new Error('inner rejected');
    const outer = new Error('iterator failed');
    const rejected = CancelablePromise.reject<number>(inner);
    rejected.catch(() => undefined);
    const observation = jest.spyOn(rejected, 'then');
    let observedBeforeThrow = false;

    function* inputs() {
      yield rejected;
      observedBeforeThrow = observation.mock.calls.length > 0;
      throw outer;
    }

    await expect(CancelablePromise.allSettled(inputs())).rejects.toBe(outer);
    expect(observedBeforeThrow).toBe(true);
    observation.mockRestore();
  });

  it('rejects with the original error when iterator acquisition throws', async () => {
    const outer = new Error('iterator getter');
    const inputs: Iterable<number> = {
      get [Symbol.iterator](): () => Iterator<number> {
        throw outer;
      },
    };
    await expect(CancelablePromise.allSettled(inputs)).rejects.toBe(outer);
  });

  it('rejects with the first next error', async () => {
    const outer = new Error('first next');
    const inputs: Iterable<number> = {
      [Symbol.iterator]: () => ({
        next(): IteratorResult<number> {
          throw outer;
        },
      }),
    };

    await expect(CancelablePromise.allSettled(inputs)).rejects.toBe(outer);
  });

  it('observes a rejected element before an overridden array iterator throws', async () => {
    const inner = new Error('array input');
    const outer = new Error('array iterator');
    const rejected = CancelablePromise.reject<number>(inner);
    rejected.catch(() => undefined);
    const observation = jest.spyOn(rejected, 'then');
    const source = [rejected];

    source[Symbol.iterator] = function* () {
      yield rejected;
      expect(observation).toHaveBeenCalledTimes(1);
      throw outer;
    };

    await expect(CancelablePromise.allSettled(source)).rejects.toBe(outer);
    observation.mockRestore();
  });

  it('observes an independently consumed source without canceling it', async () => {
    let cancelCount = 0;
    let resolveInput!: (value: number) => void;
    const input = new CancelablePromise<number>((resolve, _reject, { handleCancel }) => {
      resolveInput = resolve;
      handleCancel(() => {
        cancelCount++;
      });
    });
    const independent = input.then((value) => value);
    const outer = new Error('iterator failed');

    function* inputs() {
      yield input;
      throw outer;
    }

    await expect(CancelablePromise.allSettled(inputs())).rejects.toBe(outer);
    expect(cancelCount).toBe(0);
    resolveInput(4);
    await expect(independent).resolves.toBe(4);
  });

  it('settles normal native promises and foreign thenables in order', async () => {
    const foreign: PromiseLike<number> = {
      then(onFulfilled) {
        return Promise.resolve(onFulfilled?.(3)) as PromiseLike<any>;
      },
    };
    const settled = await CancelablePromise.allSettled([Promise.resolve(2), foreign, 7]);
    expect(settled).toEqual([
      { status: 'fulfilled', value: 2 },
      { status: 'fulfilled', value: 3 },
      { status: 'fulfilled', value: 7 },
    ]);
  });

  it('preserves rejected result records on a fully consumed iterator', async () => {
    const inner = new Error('input rejected');
    const settled = await CancelablePromise.allSettled(new Set([CancelablePromise.reject(inner)]));
    expect(settled).toEqual([{ status: 'rejected', reason: inner }]);
  });
});
