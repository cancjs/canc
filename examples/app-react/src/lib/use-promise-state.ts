import { useEffect, useRef, useState } from 'react';
import { isCancelError } from '@cancjs/promise';

export type PromiseStatus = 'idle' | 'pending' | 'fulfilled' | 'rejected';

export interface PromiseState<T> {
 status: PromiseStatus;
 value?: T;
 error?: unknown;
}

/**
 * Tracks the settlement of the latest promise passed in and exposes it as render state. Latest
 * wins: when the input promise changes, an older one's resolution is ignored, so a stale response
 * can never overwrite fresher data. A `CancelError` (the promise was canceled) resets to `idle`
 * rather than surfacing as an error, since a canceled request has no result to show.
 *
 * Pass `undefined` for "nothing in flight" (state stays / returns to `idle`).
 */
export function usePromiseState<T>(promise: PromiseLike<T> | undefined): PromiseState<T> {
 const [state, setState] = useState<PromiseState<T>>({ status: 'idle' });
 const latest = useRef<PromiseLike<T>>();

 useEffect(() => {
 latest.current = promise;

 if (!promise) {
 setState({ status: 'idle' });
 return;
 }

 setState({ status: 'pending' });
 promise.then(
 (value) => {
 if (latest.current === promise) setState({ status: 'fulfilled', value });
 },
 (error) => {
 if (latest.current !== promise) return;
 if (isCancelError(error)) setState({ status: 'idle' });
 else setState({ status: 'rejected', error });
 }
 );
 }, [promise]);

 return state;
}
