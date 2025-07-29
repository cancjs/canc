// Shared (suffix-free) types for what each middleware flavor hangs off `res.locals`. Kept in one
// place so the twin route handlers read the same shape.

import type { CancelablePromise } from '@cancjs/promise';

declare global {
 // eslint-disable-next-line @typescript-eslint/no-namespace
 namespace Express {
 interface Locals {
 /** canc flavor: run work as a request-scoped cancelable op, auto-canceled on disconnect. */
 run?: <T>(work: () => CancelablePromise<T>) => CancelablePromise<T>;
 /** vanilla workaround flavor: a signal that fires when the client disconnects. */
 abortSignal?: AbortSignal;
 }
 }
}

export {};
