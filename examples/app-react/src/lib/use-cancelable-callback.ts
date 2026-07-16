import { useCallback, useRef } from 'react';
import type { CancelablePromise } from '@cancjs/promise';

/**
 * Wraps a factory that starts a cancelable chain so that each new invocation cancels the previous
 * one that is still pending (latest wins). The returned function has the same arguments as the
 * factory and hands back the fresh `CancelablePromise`. The last pending chain is also canceled on
 * unmount via the cleanup returned from an effect, if the caller wires `cancelPending` there.
 */
export function useCancelableCallback<TArgs extends unknown[], TResult>(
 factory: (...args: TArgs) => CancelablePromise<TResult>
): {
 run: (...args: TArgs) => CancelablePromise<TResult>;
 cancelPending: () => void;
} {
 const pending = useRef<CancelablePromise<TResult> | undefined>(undefined);

 const cancelPending = useCallback(() => {
 pending.current?.cancel();
 pending.current = undefined;
 }, []);

 const run = useCallback(
 (...args: TArgs) => {
 pending.current?.cancel();
 const promise = factory(...args);
 pending.current = promise;
 return promise;
 },
 [factory]
 );

 return { run, cancelPending };
}
