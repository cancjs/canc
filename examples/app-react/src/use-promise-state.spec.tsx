import { CancelablePromise } from '@cancjs/promise';
import { act, render, screen } from '@testing-library/react';

import { usePromiseState } from './lib/use-promise-state';

describe('usePromiseState cancellation', () => {
  it('resets to idle when the still-tracked promise is canceled directly', async () => {
    const promise = new CancelablePromise<string>((_res, _rej, { handleCancel }) => {
      handleCancel(() => {});
    });

    function TestComponent(): React.JSX.Element {
      const state = usePromiseState(promise);
      return <div data-testid="status">{state.status}</div>;
    }

    render(<TestComponent />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('status').textContent).toBe('pending');

    await act(async () => {
      promise.cancel();
      await Promise.resolve();
    });

    expect(screen.getByTestId('status').textContent).toBe('idle');
  });

  it('resets to idle when passed undefined (nothing started)', () => {
    function TestComponent(): React.JSX.Element {
      const state = usePromiseState<string>(undefined);
      return <div data-testid="status">{state.status}</div>;
    }

    render(<TestComponent />);
    expect(screen.getByTestId('status').textContent).toBe('idle');
  });
});
