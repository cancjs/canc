import { CancelablePromise, type TOnCancel } from './cancelable-promise';

const NativePromise = Promise;

const DEPTH = 10000;

function noop(): void {
  /**/
}

// the bubble lands a few microtasks after the leaf cancel, a macrotask is past all of them
function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 0));
}

function deepChain(asyncCancel: boolean, onRootCancel: TOnCancel) {
  const root = new CancelablePromise<number>(
    (_resolve, _reject, { handleCancel }) => {
      handleCancel(onRootCancel);
    },
    { asyncCancel },
  );
  let leaf: CancelablePromise<number> = root;
  for (let i = 0; i < DEPTH; i++) {
    leaf = leaf.then();
  }
  return { root, leaf };
}

describe.each([
  ['awaitable cancel mode', true],
  ['sync cancel mode', false],
])('deep bubble (%s)', (_label, asyncCancel) => {
  it(`cancels the root of a ${DEPTH}-deep chain from the leaf`, async () => {
    let rootCleanups = 0;
    const { root, leaf } = deepChain(asyncCancel, () => {
      rootCleanups++;
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const cleanup = leaf.cancel();
      expect(leaf.canceled).toBe(true);
      expect(root.canceled).toBe(false);

      await macrotask();
      await cleanup;

      expect(root.canceled).toBe(true);
      expect(rootCleanups).toBe(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('runs the cascade top-down, a parent before the child that bubbled into it', async () => {
    const order: string[] = [];
    const root = new CancelablePromise<number>(
      (_resolve, _reject, { handleCancel }) => {
        handleCancel(() => void order.push('root'));
      },
      { asyncCancel },
    );
    const middle = root.then();
    middle.handleCancel(() => void order.push('middle'));
    const upper = middle.then();
    upper.handleCancel(() => void order.push('upper'));
    const leaf = upper.then();
    leaf.handleCancel(() => void order.push('leaf'));

    void leaf.cancel();
    await macrotask();

    expect(order).toEqual(['leaf', 'root', 'middle', 'upper']);
  });
});

describe.each([
  ['non-strict', false],
  ['strict', true],
])('sync cancel mode bubble, %s', (_label, strict) => {
  it('a parent handler returning a thenable leaves the other handlers running', async () => {
    const ran: string[] = [];
    const root = new CancelablePromise<number>(
      (_resolve, _reject, { handleCancel }) => {
        handleCancel(() => {
          ran.push('thenable');
          // strict refuses a thenable without attaching to it, as a direct sync cancel does
          return strict ? NativePromise.resolve() : NativePromise.reject(new Error('late cleanup failure'));
        });
        handleCancel(() => void ran.push('after'));
      },
      { asyncCancel: false, strict },
    );
    const leaf = root.then().then();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      leaf.cancel();
      await macrotask();
      await macrotask();

      expect(root.canceled).toBe(true);
      expect(ran).toEqual(['thenable', 'after']);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

it(`awaited leaf cancel waits for the root cleanup of a ${DEPTH}-deep chain`, async () => {
  let release: () => void = noop;
  let rootDone = false;
  const { root, leaf } = deepChain(true, () => {
    return new NativePromise<void>((resolve) => {
      release = () => {
        rootDone = true;
        resolve();
      };
    });
  });

  let cleanupDone = false;
  const cleanup = (leaf.cancel() as PromiseLike<unknown>).then(() => {
    cleanupDone = true;
  });
  await macrotask();
  expect(root.canceled).toBe(true);
  expect(cleanupDone).toBe(false);

  release();
  await cleanup;
  expect(rootDone).toBe(true);
});
