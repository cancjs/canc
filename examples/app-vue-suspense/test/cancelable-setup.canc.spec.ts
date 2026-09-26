import * as canc from '@cancjs/coroutine';
import { type CancelablePromise, FailureOf, isCancelError, isCancPromise } from '@cancjs/promise';
import { effectScope, type SetupContext } from 'vue';

import { type CancelableSetup, cancelableSetup } from '../src/lib/cancelable-setup';

class FetchError extends Error {
  readonly __brand = 'FetchError';
}

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

    // Type-level assertion: declared failures propagate through CancelableSetup rather than degrading to unknown.
    const failingPromise = null as unknown as CancelablePromise<string, FetchError>;
    const setupWithFailure = function* (_props: { id: string }): canc.AsyncResult<{ label: string }, FetchError> {
      const name = yield* canc.await(failingPromise);
      return { label: name };
    };
    const _wrappedFailure = cancelableSetup(setupWithFailure);
    const _typedSetup: CancelableSetup<{ id: string }, { label: string }, FetchError> = setupWithFailure;

    type ExtractFailure<T> = T extends (...args: any[]) => Generator<infer Y, any, any> ? FailureOf<Y> : never;
    type ExactFailure<T, Expected> =
      (<G>() => G extends T ? 1 : 2) extends <G>() => G extends Expected ? 1 : 2 ? true : false;
    type _AssertExactFailure = ExactFailure<ExtractFailure<typeof setupWithFailure>, FetchError>;
    const _failurePreserved: _AssertExactFailure = true;

    // Proving the declared failure survives when a coroutine delegates to the setup body
    const _wrappedCoroutine = canc.async(function* () {
      return yield* setupWithFailure({ id: 'p1' });
    });
    type CoroutineFailure = FailureOf<ReturnType<typeof _wrappedCoroutine>>;
    type _AssertCoroutineFailure = ExactFailure<CoroutineFailure, FetchError>;
    const _coroutineFailureSurvives: _AssertCoroutineFailure = true;

    void [_wrappedFailure, _typedSetup, _failurePreserved, _coroutineFailureSurvives];
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
