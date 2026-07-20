// Core engine for the fake API. Not for copying into your app: this is scaffolding that lets the
// examples prove cancellation actually reaches a simulated network boundary.
//
// Every endpoint runs through `respond`, which:
// - waits out a configurable latency (base + jitter, or 0 in seed mode),
// - rejects with an AbortError the instant an AbortSignal fires,
// - records started/completed/aborted markers on a shared call log so a test (or a demo's
// console) can assert the request was really in flight when it was canceled.

import { AbortError } from '@cancjs/toolbox';
import { mulberry32, attachAbort, type AbortSignalLike } from '@shared/util';

export type { AbortSignalLike };

export type CallStatus = 'started' | 'completed' | 'aborted' | 'failed';

export interface CallRecord {
 /** Monotonic id, unique within one MockApi instance. */
 id: number;
 /** Endpoint name, e.g. "products.list". */
 endpoint: string;
 /** Serializable-ish view of the arguments, for tracing only. */
 args: unknown;
 status: CallStatus;
 /** ms since the MockApi was created, when the call started. */
 startedAt: number;
 /** ms since the MockApi was created, when the call settled (undefined while pending). */
 settledAt?: number;
}

export interface MockApiOptions {
 /**
 * Deterministic mode. When true, latency is forced to 0 and jitter is disabled so tests settle
 * on the next microtask/timer tick in a fixed order. Combine with a fixed `seed` for stable
 * pseudo-random dataset picks.
 */
 seedMode?: boolean;
 /** Base latency in ms applied to every call (ignored in seed mode). Default 40. */
 latency?: number;
 /** Extra +/- jitter in ms, seeded so it is reproducible (ignored in seed mode). Default 20. */
 jitter?: number;
 /** Seed for the internal PRNG driving jitter and any dataset randomness. Default 1. */
 seed?: number;
 /** Optional sink for trace lines. Defaults to no-op; pass `console.log` in a demo. */
 trace?: (line: string) => void;
}

/**
 * The fake network. One instance owns a call log and a seeded PRNG. Domain modules build their
 * endpoints on top of `respond`.
 */
export class MockApi {
 readonly calls: CallRecord[] = [];
 private readonly options: Required<Omit<MockApiOptions, 'trace'>> & { trace: (line: string) => void };
 private readonly rand: () => number;
 private readonly createdAt = Date.now();
 private nextId = 1;

 constructor(options: MockApiOptions = {}) {
 this.options = {
 seedMode: options.seedMode ?? false,
 latency: options.latency ?? 40,
 jitter: options.jitter ?? 20,
 seed: options.seed ?? 1,
 trace: options.trace ?? (() => {}),
 };
 this.rand = mulberry32(this.options.seed);
 }

 /** Clears the call log. Handy between deterministic test cases. */
 reset(): void {
 this.calls.length = 0;
 }

 /** Next seeded pseudo-random float in [0, 1). Exposed for domain datasets that want variety. */
 random(): number {
 return this.rand();
 }

 private now(): number {
 return Date.now() - this.createdAt;
 }

 private nextLatency(): number {
 if (this.options.seedMode) return 0;
 const spread = (this.rand() * 2 - 1) * this.options.jitter;
 return Math.max(0, Math.round(this.options.latency + spread));
 }

 /**
 * Runs one simulated request. Resolves with `produce()`'s value after the latency elapses, or
 * rejects with an AbortError the moment `signal` fires (whichever comes first). Records
 * started/settled markers on `this.calls` throughout.
 */
 respond<T>(endpoint: string, args: unknown, produce: () => T, signal?: AbortSignalLike): Promise<T> {
 const id = this.nextId++;
 const record: CallRecord = {
 id,
 endpoint,
 args,
 status: 'started',
 startedAt: this.now(),
 };
 this.calls.push(record);
 this.options.trace(`[mock-api] #${id} ${endpoint} started`);

 return new Promise<T>((resolve, reject) => {
 let detach: (() => void) | undefined;

 const settleAborted = () => {
 detach?.();
 record.status = 'aborted';
 record.settledAt = this.now();
 this.options.trace(`[mock-api] #${id} ${endpoint} aborted`);
 reject(new AbortError());
 };

 // Pre-aborted signals reject before any latency runs (the request never leaves the client).
 if (signal?.aborted) {
 settleAborted();
 return;
 }

 const timer = setTimeout(() => {
 detach?.();
 record.status = 'completed';
 record.settledAt = this.now();
 this.options.trace(`[mock-api] #${id} ${endpoint} completed`);
 try {
 resolve(produce());
 } catch (error) {
 record.status = 'failed';
 reject(error);
 }
 }, this.nextLatency());

 detach = attachAbort(signal, () => {
 clearTimeout(timer);
 settleAborted();
 });
 });
 }
}
