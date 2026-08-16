import * as canc from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { useCancelableEffect } from './lib/use-cancelable-effect';

function createDeferred<T = string>(): {
  promise: CancelablePromise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  isCanceled: () => boolean;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  let canceled = false;
  const promise = new CancelablePromise<T>((res, rej, { handleCancel }) => {
    resolve = res;
    reject = rej;
    handleCancel(() => {
      canceled = true;
    });
  });
  return {
    promise,
    resolve,
    reject,
    isCanceled: () => canceled,
  };
}

describe('useCancelableEffect with generator', () => {
  it('cancels the coroutine on unmount without post-unmount warnings', async () => {
    const deferred = createDeferred<string>();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    function TestComponent(): React.JSX.Element {
      const [state, setState] = useState('initial');
      useCancelableEffect(function* () {
        const result = yield* canc.await(deferred.promise);
        setState(result);
      }, []);
      return <div data-testid="state">{state}</div>;
    }

    const { unmount } = render(<TestComponent />);
    expect(screen.getByTestId('state').textContent).toBe('initial');
    expect(deferred.isCanceled()).toBe(false);

    unmount();

    expect(deferred.isCanceled()).toBe(true);

    deferred.resolve('resolved');
    await act(async () => {
      await Promise.resolve();
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('cancels superseded coroutine when dependencies change', async () => {
    const firstDeferred = createDeferred<string>();
    const secondDeferred = createDeferred<string>();

    function TestComponent({ step }: { step: number }): React.JSX.Element {
      const [state, setState] = useState('initial');
      useCancelableEffect(
        function* () {
          const p = step === 1 ? firstDeferred.promise : secondDeferred.promise;
          const result = yield* canc.await(p);
          setState(result);
        },
        [step],
      );
      return <div data-testid="state">{state}</div>;
    }

    const { rerender } = render(<TestComponent step={1} />);
    expect(firstDeferred.isCanceled()).toBe(false);

    rerender(<TestComponent step={2} />);
    expect(firstDeferred.isCanceled()).toBe(true);
    expect(secondDeferred.isCanceled()).toBe(false);

    await act(async () => {
      secondDeferred.resolve('step 2 done');
      await Promise.resolve();
    });

    expect(screen.getByTestId('state').textContent).toBe('step 2 done');
  });

  it('aborts intermediate steps in a multi-step coroutine upon unmount', () => {
    const step1 = createDeferred<string>();
    const step2 = createDeferred<string>();
    let step2Started = false;

    function TestComponent(): React.JSX.Element {
      const [state, setState] = useState('initial');
      useCancelableEffect(function* () {
        const r1 = yield* canc.await(step1.promise);
        step2Started = true;
        const r2 = yield* canc.await(step2.promise);
        setState(`${r1}-${r2}`);
      }, []);
      return <div data-testid="state">{state}</div>;
    }

    const { unmount } = render(<TestComponent />);
    unmount();

    expect(step1.isCanceled()).toBe(true);
    expect(step2Started).toBe(false);
    expect(step2.isCanceled()).toBe(false);
  });
});

describe('useCancelableEffect with thunk callback', () => {
  it('cancels returned CancelablePromise on unmount', () => {
    const deferred = createDeferred<string>();

    function TestComponent(): React.JSX.Element {
      useCancelableEffect(() => deferred.promise, []);
      return <div>thunk</div>;
    }

    const { unmount } = render(<TestComponent />);
    expect(deferred.isCanceled()).toBe(false);

    unmount();
    expect(deferred.isCanceled()).toBe(true);
  });

  it('runs returned cleanup function on unmount', () => {
    const cleanupSpy = jest.fn();

    function TestComponent(): React.JSX.Element {
      useCancelableEffect(() => cleanupSpy, []);
      return <div>cleanup</div>;
    }

    const { unmount } = render(<TestComponent />);
    expect(cleanupSpy).not.toHaveBeenCalled();

    unmount();
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });
});
