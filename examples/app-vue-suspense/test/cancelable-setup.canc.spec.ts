import * as canc from '@cancjs/coroutine';
import { isCancelError, isCancPromise } from '@cancjs/promise';
import { effectScope, type SetupContext } from 'vue';

import { cancelableSetup } from '../src/lib/cancelable-setup';

const ctx = {} as SetupContext;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Runs the wrapped setup inside an effect scope, the way a component would, and hands back the
// scope so the test can tear it down mid-load.
function runInScope<Props, Result>(
  setup: (props: Props, ctx: SetupContext) => Result | PromiseLike<Result>,
  props: Props,
) {
  const scope = effectScope();
  const result = scope.run(() => setup(props, ctx))!;
  return { result, scope };
}

describe('cancelableSetup', () => {
  it('runs a generator setup as one cancelable coroutine', async () => {
    const load = deferred<string>();
    const setup = cancelableSetup(function* (props: { id: string }) {
      const name = yield* canc.await(load.promise);
      return { label: `${props.id}:${name}` };
    });

    const { result } = runInScope(setup, { id: 'p1' });
    expect(isCancPromise(result)).toBe(true);

    load.resolve('chair');
    await expect(result).resolves.toEqual({ label: 'p1:chair' });
  });

  it('accepts a setup already wrapped with canc.async', async () => {
    const load = deferred<string>();
    const setup = cancelableSetup(
      canc.async(function* (props: { id: string }) {
        const name = yield* canc.await(load.promise);
        return { label: `${props.id}:${name}` };
      }),
    );

    const { result } = runInScope(setup, { id: 'p2' });
    expect(isCancPromise(result)).toBe(true);

    load.resolve('lamp');
    await expect(result).resolves.toEqual({ label: 'p2:lamp' });
  });

  it('returns the result of a sync setup untouched', () => {
    const bindings = { label: 'no load here' };
    const setup = cancelableSetup(() => bindings);

    const { result } = runInScope(setup, {});

    expect(result).toBe(bindings);
  });

  it('cancels the in-flight setup when the scope is disposed', async () => {
    const load = deferred<string>();
    let cleanedUp = false;
    const setup = cancelableSetup(function* () {
      try {
        return { label: yield* canc.await(load.promise) };
      } finally {
        cleanedUp = true;
      }
    });

    const { result, scope } = runInScope(setup, {});
    scope.stop();

    const error = await Promise.resolve(result).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(isCancelError(error)).toBe(true);
    expect(cleanedUp).toBe(true);
  });
});
