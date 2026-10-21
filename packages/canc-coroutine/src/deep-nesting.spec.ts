import { CancelablePromise } from '@cancjs/promise';

import { cancAsync, cancAwait } from './coroutine';
import { cancGenAsync, cancGenAwait } from './coroutine-gen';

const DEPTH = 4000;

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
  return {
    start: () => poll(1).next() as CancelablePromise<unknown>,
    built: () => built,
    log,
  };
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
    expect(fromTop.log).toEqual(['leaf', 'finally 3', 'finally 2', 'finally 1', 'awaited']);

    const fromLeaf = nest(3);
    const view = fromLeaf.start().then();
    view.catch(() => {});
    await settleUntil(() => fromLeaf.built() === 3);
    await view.cancel();
    expect(fromLeaf.log).toEqual(['leaf', 'finally 3', 'finally 2', 'finally 1']);
  });
});

const sourceLog: string[] = [];

const tick = (ms: number) => new CancelablePromise<void>((resolve) => setTimeout(resolve, ms));

interface ICleanupNest {
  top: CancelablePromise<unknown>;
  log: string[];
}

// every level runs an async finally, so the order shows whether inner cleanup ends first
function asyncCleanupNest(): ICleanupNest {
  const log: string[] = [];
  const level = (name: string, inner?: () => CancelablePromise<unknown>) =>
    cancAsync(
      function* (): Generator<any, any, any> {
        try {
          if (inner) return yield inner();
          return yield new CancelablePromise<never>(() => {});
        } finally {
          log.push(`${name} start`);
          yield tick(2);
          yield tick(2);
          log.push(`${name} end`);
        }
      },
      { asyncCancel: true },
    );
  const top = level('a', level('b', level('c')))();
  return { top, log };
}

function genCleanupNest(): ICleanupNest {
  const log: string[] = [];
  const level = (name: string, inner?: () => CancelablePromise<unknown>) =>
    cancGenAsync(
      function* (): Generator<any, void, any> {
        try {
          if (inner) {
            yield* cancGenAwait(inner());
            return;
          }
          yield* cancGenAwait(new CancelablePromise<never>(() => {}));
        } finally {
          log.push(`${name} start`);
          yield* cancGenAwait(tick(2));
          yield* cancGenAwait(tick(2));
          log.push(`${name} end`);
        }
      },
      { asyncCancel: true },
    );
  const c = level('c');
  const b = level('b', () => c().next() as CancelablePromise<unknown>);
  const a = level('a', () => b().next() as CancelablePromise<unknown>);
  const top = a().next() as CancelablePromise<unknown>;
  return { top, log };
}

describe.each([
  ['cancAsync', asyncCleanupNest],
  ['cancGenAsync', genCleanupNest],
])('%s nest with async cleanup', (_name, nest) => {
  it('finishes inner cleanup before the outer body unwinds', async () => {
    const { top, log } = nest();
    top.catch((error: Error) => log.push(`top ${error.name}`));
    await tick(5);

    await top.cancel();
    log.push('cancel awaited');

    expect(log.filter((entry) => entry.endsWith(' end'))).toEqual(['c end', 'b end', 'a end']);
    expect(log.indexOf('a start')).toBeGreaterThan(log.indexOf('b end'));
    expect(log.indexOf('b start')).toBeGreaterThan(log.indexOf('c end'));
    expect(log.slice(-2)).toEqual(['top CancelError', 'cancel awaited']);
  });
});

describe.each([
  [
    'cancAsync',
    (source: CancelablePromise<never>) =>
      cancAsync(
        function* () {
          try {
            return yield* cancAwait(source);
          } finally {
            sourceLog.push('body finally');
          }
        },
        { asyncCancel: true },
      )(),
  ],
  [
    'cancGenAsync',
    (source: CancelablePromise<never>) =>
      cancGenAsync(
        function* () {
          try {
            yield* cancGenAwait(source);
          } finally {
            sourceLog.push('body finally');
          }
        },
        { asyncCancel: true },
      )().next() as CancelablePromise<unknown>,
  ],
])('%s awaiting a sole source with an async cancel handler', (_name, run) => {
  it('unwinds only after the source cleanup ends', async () => {
    sourceLog.length = 0;
    const source = new CancelablePromise<never>(
      (_resolve, _reject, { handleCancel }) => {
        handleCancel(async () => {
          await tick(2);
          sourceLog.push('source cleaned');
        });
      },
      { asyncCancel: true },
    );
    const top = run(source);
    top.catch(() => sourceLog.push('top rejected'));
    await tick(2);

    await top.cancel();
    sourceLog.push('cancel awaited');

    expect(sourceLog).toEqual(['source cleaned', 'body finally', 'top rejected', 'cancel awaited']);
  });
});
