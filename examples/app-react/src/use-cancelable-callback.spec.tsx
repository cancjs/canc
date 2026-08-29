import { CancelablePromise } from '@cancjs/promise';
import { CANCEL_REASON_SUPERSEDED, CANCEL_REASON_UNMOUNTED } from '@shared/util';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Component, type ReactNode } from 'react';

import { useCancelableCallback } from './lib/use-cancelable-callback';

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
  cancelReason: () => unknown;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  let reason: unknown;
  const promise = new CancelablePromise<T>((res, rej, { handleCancel }) => {
    resolve = res;
    reject = rej;
    handleCancel((r) => {
      reason = r;
    });
  });
  return {
    promise,
    resolve,
    reject,
    cancelReason: () => reason,
  };
}

describe('useCancelableCallback pending', () => {
  it('renders a pending spinner while a run is in flight, hides it once settled', async () => {
    const deferred = createDeferred<string>();

    function TestComponent(): React.JSX.Element {
      const { run, pending } = useCancelableCallback(() => deferred.promise);
      return (
        <div>
          {pending && <span data-testid="spinner" />}
          <button onClick={() => void run()}>go</button>
        </div>
      );
    }

    render(<TestComponent />);
    expect(screen.queryByTestId('spinner')).toBeNull();

    fireEvent.click(screen.getByText('go'));
    expect(screen.getByTestId('spinner')).toBeInTheDocument();

    await act(async () => {
      deferred.resolve('done');
      await Promise.resolve();
    });

    expect(screen.queryByTestId('spinner')).toBeNull();
  });
});

describe('useCancelableCallback cancelPrevious', () => {
  it('defaults to true: a second run cancels the first with the superseded reason', async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    let calls = 0;

    function TestComponent(): React.JSX.Element {
      const { run, pending } = useCancelableCallback(() => (++calls === 1 ? first.promise : second.promise));
      return (
        <div>
          {pending && <span data-testid="spinner" />}
          <button onClick={() => void run()}>go</button>
        </div>
      );
    }

    render(<TestComponent />);
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByText('go'));

    expect(first.cancelReason()).toBe(CANCEL_REASON_SUPERSEDED);
    // second run is still pending, spinner stays up
    expect(screen.getByTestId('spinner')).toBeInTheDocument();

    await act(async () => {
      second.resolve('done');
      await Promise.resolve();
    });

    expect(screen.queryByTestId('spinner')).toBeNull();
  });

  it('cancelPrevious: false rejects a call made while one is already pending, leaving it untouched', async () => {
    const first = createDeferred<string>();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    function TestComponent(props: { onSecondReject: (err: unknown) => void }): React.JSX.Element {
      const { run } = useCancelableCallback(() => first.promise, { cancelPrevious: false });
      return (
        <button
          onClick={() => {
            void run();
            run().then(undefined, props.onSecondReject);
          }}
        >
          go
        </button>
      );
    }

    const onSecondReject = jest.fn();
    render(
      <RecordingErrorBoundary onCatch={() => {}}>
        <TestComponent onSecondReject={onSecondReject} />
      </RecordingErrorBoundary>,
    );
    fireEvent.click(screen.getByText('go'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSecondReject).toHaveBeenCalledTimes(1);
    expect(first.cancelReason()).toBeUndefined();
    errorSpy.mockRestore();
  });

  it('routes rejection from a conflict call through the error boundary when cancelPrevious is false', async () => {
    const first = createDeferred<string>();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onCatch = jest.fn();

    function TestComponent(): React.JSX.Element {
      const { run } = useCancelableCallback(() => first.promise, { cancelPrevious: false });
      return (
        <button
          onClick={() => {
            void run();
            void run();
          }}
        >
          go
        </button>
      );
    }

    render(
      <RecordingErrorBoundary onCatch={onCatch}>
        <TestComponent />
      </RecordingErrorBoundary>,
    );

    fireEvent.click(screen.getByText('go'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onCatch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('boundary-caught')).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});

describe('useCancelableCallback cancelPending', () => {
  it('cancels the pending run with the unmounted reason by default', async () => {
    const deferred = createDeferred<string>();
    let cancelPendingRef: (() => void) | undefined;

    function TestComponent(): React.JSX.Element {
      const { run, cancelPending, pending } = useCancelableCallback(() => deferred.promise);
      cancelPendingRef = cancelPending;
      return (
        <div>
          {pending && <span data-testid="spinner" />}
          <button onClick={() => void run()}>go</button>
        </div>
      );
    }

    render(<TestComponent />);
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByTestId('spinner')).toBeInTheDocument();

    act(() => {
      cancelPendingRef!();
    });

    expect(deferred.cancelReason()).toBe(CANCEL_REASON_UNMOUNTED);
    expect(screen.queryByTestId('spinner')).toBeNull();
  });
});

describe('useCancelableCallback error routing', () => {
  it('escalates a non-cancel rejection from void run() to the nearest error boundary', async () => {
    const deferred = createDeferred<string>();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onCatch = jest.fn();

    function TestComponent(): React.JSX.Element {
      const { run } = useCancelableCallback(() => deferred.promise);
      return <button onClick={() => void run()}>go</button>;
    }

    render(
      <RecordingErrorBoundary onCatch={onCatch}>
        <TestComponent />
      </RecordingErrorBoundary>,
    );

    fireEvent.click(screen.getByText('go'));

    const failure = new Error('booking submission failed');
    await act(async () => {
      deferred.reject(failure);
      await Promise.resolve();
    });

    expect(onCatch).toHaveBeenCalledWith(failure);
    expect(screen.getByTestId('boundary-caught')).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('does not escalate a CancelError to the error boundary', async () => {
    const deferred = createDeferred<string>();
    const onCatch = jest.fn();

    function TestComponent(): React.JSX.Element {
      const { run, cancelPending } = useCancelableCallback(() => deferred.promise);
      return (
        <div>
          <button onClick={() => void run()}>go</button>
          <button onClick={() => cancelPending()}>cancel</button>
        </div>
      );
    }

    render(
      <RecordingErrorBoundary onCatch={onCatch}>
        <TestComponent />
      </RecordingErrorBoundary>,
    );

    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByText('cancel'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onCatch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('boundary-caught')).toBeNull();
  });
});
