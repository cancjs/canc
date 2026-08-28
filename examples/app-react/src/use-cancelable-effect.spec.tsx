import * as canc from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';
import { CANCEL_REASON_DEPS_CHANGED, CANCEL_REASON_UNMOUNTED } from '@shared/util';
import { act, render, screen } from '@testing-library/react';
import { Component, type ReactNode, StrictMode, useState } from 'react';

import { useCancelableEffect } from './lib/use-cancelable-effect';

// class-only boundary for the spec, real boundaries have no hook form
// records what it caught instead of rendering a fallback
class RecordingErrorBoundary extends Component<
  { onCatch: (error: unknown) => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onCatch(error);
  }

  render(): ReactNode {
    return this.state.hasError ? <div data-testid="boundary-caught" /> : this.props.children;
  }
}

function createDeferred<T = string>(): {
  promise: CancelablePromise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  isCanceled: () => boolean;
  cancelReason: () => unknown;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  let canceled = false;
  let reason: unknown;
  const promise = new CancelablePromise<T>((res, rej, { handleCancel }) => {
    resolve = res;
    reject = rej;
    handleCancel((r) => {
      canceled = true;
      reason = r;
    });
  });
  return {
    promise,
    resolve,
    reject,
    isCanceled: () => canceled,
    cancelReason: () => reason,
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
  it('cancels returned CancelablePromise on unmount with the unmounted reason', () => {
    const deferred = createDeferred<string>();

    function TestComponent(): React.JSX.Element {
      useCancelableEffect(() => deferred.promise, []);
      return <div>thunk</div>;
    }

    const { unmount } = render(<TestComponent />);
    expect(deferred.isCanceled()).toBe(false);

    unmount();
    expect(deferred.isCanceled()).toBe(true);
    expect(deferred.cancelReason()).toBe(CANCEL_REASON_UNMOUNTED);
  });

  it('cancels the previous CancelablePromise with the deps-changed reason on a dependency change', () => {
    const firstDeferred = createDeferred<string>();
    const secondDeferred = createDeferred<string>();

    function TestComponent({ step }: { step: number }): React.JSX.Element {
      useCancelableEffect(() => (step === 1 ? firstDeferred.promise : secondDeferred.promise), [step]);
      return <div>thunk</div>;
    }

    const { rerender, unmount } = render(<TestComponent step={1} />);
    expect(firstDeferred.isCanceled()).toBe(false);

    rerender(<TestComponent step={2} />);
    expect(firstDeferred.isCanceled()).toBe(true);
    expect(firstDeferred.cancelReason()).toBe(CANCEL_REASON_DEPS_CHANGED);

    unmount();
    expect(secondDeferred.cancelReason()).toBe(CANCEL_REASON_UNMOUNTED);
  });

  it('reports deps-changed reason when dependencies change after StrictMode remount', () => {
    const runs: ReturnType<typeof createDeferred<string>>[] = [];

    function TestComponent({ step }: { step: number }): React.JSX.Element {
      useCancelableEffect(() => {
        const deferred = createDeferred<string>();
        runs.push(deferred);
        return deferred.promise;
      }, [step]);
      return <div>strict</div>;
    }

    const { rerender, unmount } = render(
      <StrictMode>
        <TestComponent step={1} />
      </StrictMode>,
    );

    expect(runs).toHaveLength(2);
    expect(runs[0].isCanceled()).toBe(true);
    expect(runs[0].cancelReason()).toBe(CANCEL_REASON_UNMOUNTED);
    expect(runs[1].isCanceled()).toBe(false);

    rerender(
      <StrictMode>
        <TestComponent step={2} />
      </StrictMode>,
    );

    expect(runs[1].isCanceled()).toBe(true);
    expect(runs[1].cancelReason()).toBe(CANCEL_REASON_DEPS_CHANGED);

    unmount();
    const lastRun = runs[runs.length - 1];
    expect(lastRun.isCanceled()).toBe(true);
    expect(lastRun.cancelReason()).toBe(CANCEL_REASON_UNMOUNTED);
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

describe('useCancelableEffect error routing', () => {
  it('escalates a non-cancel rejection to the nearest error boundary', async () => {
    const deferred = createDeferred<string>();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onCatch = jest.fn();

    function TestComponent(): React.JSX.Element {
      useCancelableEffect(() => deferred.promise, []);
      return <div data-testid="content">content</div>;
    }

    render(
      <RecordingErrorBoundary onCatch={onCatch}>
        <TestComponent />
      </RecordingErrorBoundary>,
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();

    const failure = new Error('flight search backend is down');
    await act(async () => {
      deferred.reject(failure);
      await Promise.resolve();
    });

    expect(onCatch).toHaveBeenCalledWith(failure);
    expect(screen.getByTestId('boundary-caught')).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('does not escalate a CancelError from an unmount-time cancel', async () => {
    const deferred = createDeferred<string>();
    const onCatch = jest.fn();

    function TestComponent(): React.JSX.Element {
      useCancelableEffect(() => deferred.promise, []);
      return <div data-testid="content">content</div>;
    }

    const { unmount } = render(
      <RecordingErrorBoundary onCatch={onCatch}>
        <TestComponent />
      </RecordingErrorBoundary>,
    );

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCatch).not.toHaveBeenCalled();
  });
});
