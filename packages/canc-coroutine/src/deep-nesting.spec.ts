import { CancelablePromise } from '@cancjs/promise';

import { cancAsync, cancAwait } from './coroutine';
import { cancGenAsync, cancGenAwait } from './coroutine-gen';

const DEPTH = 10000;

// a counted release stops the inner level a couple of jobs later, so wait on the flag itself
async function settleUntil(done: () => boolean): Promise<void> {
  for (let i = 0; i < 100000 && !done(); i++) {
    await Promise.resolve();
  }
}

function leafSource(onCancel: () => void) {
  return new CancelablePromise<never>((_resolve, _reject, { handleCancel }) => {
    handleCancel(onCancel);
  });
}

interface INest {
  // the promise that settles with the top level: the coroutine itself, or its first step
  start(): CancelablePromise<unknown>;
  built(): number;
  log: string[];
}

// every level yields once before nesting, so building the nest never recurses either
function asyncNest(depth: number): INest {
  const log: string[] = [];
  let built = 0;
  const poll: (n: number) => CancelablePromise<unknown> = cancAsync(function* (n: number): Generator<any, any, any> {
    yield* cancAwait(CancelablePromise.resolve(n));
    built++;
    try {
      if (n === depth) {
        return yield* cancAwait(leafSource(() => log.push('leaf')));
      }
      return yield poll(n + 1);
    } finally {
      if (depth <= 3) log.push(`finally ${n}`);
    }
  });
  return { start: () => poll(1), built: () => built, log };
}

function genNest(depth: number): INest {
  const log: string[] = [];
  let built = 0;
  const poll = cancGenAsync(function* (n: number): Generator<any, void, any> {
    yield* cancGenAwait(CancelablePromise.resolve(n));
    built++;
    try {
      if (n === depth) {
        yield* cancGenAwait(leafSource(() => log.push('leaf')));
        return;
      }
      yield* cancGenAwait(poll(n + 1).next());
    } finally {
      if (depth <= 3) log.push(`finally ${n}`);
    }
  });
  return { start: () => poll(1).next() as CancelablePromise<unknown>, built: () => built, log };
}

describe.each([
  ['cancAsync', asyncNest],
  ['cancGenAsync', genNest],
])('%s nested deeply', (_name, nest) => {
  it('cancels every level from the top without overflowing the stack', async () => {
    const { start, built, log } = nest(DEPTH);
    const top = start();
    top.catch(() => {});
    await settleUntil(() => built() === DEPTH);
    expect(built()).toBe(DEPTH);

    await top.cancel();
    expect(top.canceled).toBe(true);

    await settleUntil(() => log.length > 0);
    expect(log).toEqual(['leaf']);
  });

  it('bubbles a leaf view cancel up to the top', async () => {
    const { start, built, log } = nest(DEPTH);
    const top = start();
    const view = top.then();
    view.catch(() => {});
    await settleUntil(() => built() === DEPTH);

    await view.cancel();

    expect(top.canceled).toBe(true);
    expect(log).toEqual(['leaf']);
  });

  it('keeps the unwind order of a shallow nest', async () => {
    const fromTop = nest(3);
    const top = fromTop.start();
    top.catch(() => {});
    await settleUntil(() => fromTop.built() === 3);
    await top.cancel();
    fromTop.log.push('awaited');
    await settleUntil(() => fromTop.log.includes('leaf'));
    expect(fromTop.log).toEqual(['finally 1', 'awaited', 'finally 3', 'finally 2', 'leaf']);

    const fromLeaf = nest(3);
    const view = fromLeaf.start().then();
    view.catch(() => {});
    await settleUntil(() => fromLeaf.built() === 3);
    await view.cancel();
    expect(fromLeaf.log).toEqual(['finally 3', 'finally 2', 'finally 1', 'leaf']);
  });
});
