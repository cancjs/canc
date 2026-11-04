// The executor and cancelify signals hand out the lib's own AbortSignal, so they pass to fetch as is
import { CancelablePromise, IAbortSignal, IExecutorContext } from '@cancjs/promise';
import { cancelify, ICancelifyContext } from '@cancjs/toolbox';

import type { Equal, Expect } from './assert-type';

export const fromDestructured = new CancelablePromise<Response>((resolve, reject, { signal }) => {
  fetch('https://example.test/', { signal }).then(resolve, reject);
});

export const fromContext = new CancelablePromise<Response>((resolve, reject, ctx) => {
  fetch('https://example.test/', { signal: ctx.signal }).then(resolve, reject);
  const platform: AbortSignal = ctx.signal;
  platform.addEventListener('abort', () => undefined);
});

export const fromGetSignal = new CancelablePromise<Response>((resolve, reject, ctx) => {
  fetch('https://example.test/', { signal: ctx.getSignal() }).then(resolve, reject);
});

export const fromCancelify = cancelify((ctx) => fetch('https://example.test/', { signal: ctx.signal }));

type _executorSignal = Expect<Equal<IExecutorContext['signal'], AbortSignal>>;
type _cancelifySignal = Expect<Equal<ICancelifyContext['signal'], AbortSignal>>;

// the platform signal still satisfies the minimal shape the `signal` option accepts
export const minimal: IAbortSignal = null as unknown as IExecutorContext['signal'];
