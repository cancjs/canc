import { CancelablePromise } from '@cancjs/promise';

import { cancAsync } from './coroutine';
import { cancGenAsync } from './coroutine-gen';

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// 'timer' wins only if the work leaves the microtask queue idle
async function settleBeforeTimer(work: Promise<unknown>): Promise<'timer' | { error: unknown }> {
  const timer = macrotask().then(() => 'timer' as const);
  const outcome = work.then(
    () => ({ error: undefined as unknown }),
    (error: unknown) => ({ error }),
  );

  return Promise.race([timer, outcome]);
}

// Generator-like without return(): the shape the guard must refuse up front
function noReturnGeneratorLike(): any {
  return {
    next: () => ({ done: true, value: 1 }),
    throw: (e: unknown) => {
      throw e;
    },
  };
}

describe('async generator and malformed step guards', () => {
  jest.setTimeout(2000);

  describe('cancAsync', () => {
    it('rejects an async generator body with a TypeError before the next macrotask', async () => {
      const co = cancAsync(async function* () {} as any);

      const outcome = await settleBeforeTimer(co());

      expect(outcome).not.toBe('timer');
      expect((outcome as { error: unknown }).error).toBeInstanceOf(TypeError);
      expect(((outcome as { error: Error }).error as Error).message).toMatch(/async generator/);
    });

    it('rejects a generator-like without return at call time', async () => {
      const co = cancAsync(noReturnGeneratorLike);

      const outcome = await settleBeforeTimer(co());

      expect(outcome).not.toBe('timer');
      expect((outcome as { error: unknown }).error).toBeInstanceOf(TypeError);
      expect(((outcome as { error: Error }).error as Error).message).toMatch(/without return/);
    });

    it('rejects a step result that is a promise', async () => {
      const co = cancAsync((() => ({
        next: () => Promise.resolve({ done: false, value: 1 }),
        throw: (e: unknown) => {
          throw e;
        },
        return: () => ({ done: true, value: undefined }),
      })) as any);

      const outcome = await settleBeforeTimer(co());

      expect(outcome).not.toBe('timer');
      expect((outcome as { error: unknown }).error).toBeInstanceOf(TypeError);
      expect(((outcome as { error: Error }).error as Error).message).toMatch(/received a promise/);
    });

    it('rejects a step result that is not an object after a yielded step', async () => {
      let calls = 0;
      const co = cancAsync((() => ({
        next: () => (calls++ === 0 ? { done: false, value: CancelablePromise.resolve(1) } : 42),
        throw: (e: unknown) => {
          throw e;
        },
        return: () => ({ done: true, value: undefined }),
      })) as any);

      const outcome = await settleBeforeTimer(co());

      expect(outcome).not.toBe('timer');
      expect((outcome as { error: unknown }).error).toBeInstanceOf(TypeError);
      expect(((outcome as { error: Error }).error as Error).message).toMatch(/non-object/);
    });

    it('still drives a valid generator', async () => {
      const co = cancAsync(function* () {
        return (yield CancelablePromise.resolve(5)) as number;
      });

      expect(await co()).toBe(5);
    });
  });

  describe('cancGenAsync', () => {
    it('rejects the consumer of an async generator body with a TypeError before the next macrotask', async () => {
      const iterator = cancGenAsync(async function* () {} as any)();

      const outcome = await settleBeforeTimer(iterator.next());

      expect(outcome).not.toBe('timer');
      expect((outcome as { error: unknown }).error).toBeInstanceOf(TypeError);
      expect(((outcome as { error: Error }).error as Error).message).toMatch(/async generator/);
    });

    it('rejects the consumer when the body is a generator-like without return', async () => {
      const iterator = cancGenAsync(noReturnGeneratorLike)();

      const outcome = await settleBeforeTimer(iterator.next());

      expect(outcome).not.toBe('timer');
      expect((outcome as { error: unknown }).error).toBeInstanceOf(TypeError);
      expect(((outcome as { error: Error }).error as Error).message).toMatch(/without return/);
    });

    it('stops a for await consumer of an async generator body with a TypeError', async () => {
      const consume = async () => {
        for await (const _item of cancGenAsync(async function* () {} as any)()) {
          // a body that is not driven correctly yields forever
        }
      };

      const outcome = await settleBeforeTimer(consume());

      expect(outcome).not.toBe('timer');
      expect((outcome as { error: unknown }).error).toBeInstanceOf(TypeError);
    });

    it('reports completion on the pulls after the rejection', async () => {
      const iterator = cancGenAsync(async function* () {} as any)();

      await iterator.next().catch(() => undefined);

      expect(await iterator.next()).toEqual({ value: undefined, done: true });
    });

    it('rejects a step result that is a promise', async () => {
      const iterator = cancGenAsync((() => ({
        next: () => Promise.resolve({ done: false, value: 1 }),
        throw: (e: unknown) => {
          throw e;
        },
        return: () => ({ done: true, value: undefined }),
      })) as any)();

      const outcome = await settleBeforeTimer(iterator.next());

      expect(outcome).not.toBe('timer');
      expect((outcome as { error: unknown }).error).toBeInstanceOf(TypeError);
    });

    it('still drives a valid generator', async () => {
      const iterator = cancGenAsync(function* () {
        yield 1;
      })();

      expect(await iterator.next()).toEqual({ value: 1, done: false });
    });
  });
});
