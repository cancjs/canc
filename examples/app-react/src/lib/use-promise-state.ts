import { isCancelError } from '@cancjs/promise';
import { useEffect, useRef, useState } from 'react';

export type PromiseStatus = 'idle' | 'pending' | 'fulfilled' | 'rejected';

export interface PromiseState<T> {
  status: PromiseStatus;
  value?: T;
  error?: unknown;
}

/**
 * Tracks the settlement of the latest promise passed in and exposes it as render state. Latest
 * wins: when the input promise changes, an older one's resolution is ignored, so a stale response
 * can never overwrite fresher data. `idle` covers both "nothing started" (pass `undefined`) and
 * a run that was canceled: a canceled run has no result to show and resets to `idle`.
 *
 * A non-cancel rejection stays local to `error` here rather than escalating to the nearest error
 * boundary the way `useCancelableEffect` does: this hook already hands the caller a channel to
 * render the failure inline, and a boundary throw would unmount the very state it just set, in the
 * same render, discarding it before anything could read it.
 */
export function usePromiseState<T>(promise: PromiseLike<T> | undefined): PromiseState<T> {
  const [state, setState] = useState<PromiseState<T>>({ status: 'idle' });
  const latest = useRef<PromiseLike<T> | undefined>(undefined);

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
        if (isCancelError(error)) {
          setState({ status: 'idle' });
          return;
        }
        setState({ status: 'rejected', error });
      },
    );
  }, [promise]);

  return state;
}
