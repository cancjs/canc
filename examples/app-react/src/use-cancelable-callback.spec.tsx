import { CancelablePromise } from '@cancjs/promise';
import { CANCEL_REASON_SUPERSEDED, CANCEL_REASON_UNMOUNTED } from '@shared/util';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { useCancelableCallback } from './lib/use-cancelable-callback';

function createDeferred<T = string>(): {
  promise: CancelablePromise<T>;
  resolve: (value: T) => void;
  cancelReason: () => unknown;
} {
  let resolve!: (value: T) => void;
  let reason: unknown;
  const promise = new CancelablePromise<T>((res, _rej, { handleCancel }) => {
    resolve = res;
    handleCancel((r) => {
      reason = r;
    });
  });
  return { promise, resolve, cancelReason: () => reason };
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
    render(<TestComponent onSecondReject={onSecondReject} />);
    fireEvent.click(screen.getByText('go'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSecondReject).toHaveBeenCalledTimes(1);
    expect(first.cancelReason()).toBeUndefined();
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
