// Shared (suffix-free) types for what the vanilla workaround middleware hangs off `res.locals`.
// The canc flavor needs no such augmentation: cancellation wiring lives in `lib/cancelable-route`.

declare global {
 // eslint-disable-next-line @typescript-eslint/no-namespace
 namespace Express {
 interface Locals {
 /** vanilla workaround flavor: a signal that fires when the client disconnects. */
 abortSignal?: AbortSignal;
 }
 }
}

export {};
