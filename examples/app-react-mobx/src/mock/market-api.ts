// Fake market data feed. Pretend this is your quotes provider. It is scaffolding, not something
// to copy into an app: it exists so the example can prove a cancel() actually reached an in-flight
// request. Every call records started/completed/aborted on a shared log, and honors an AbortSignal.

export type CallStatus = 'started' | 'completed' | 'aborted';

export interface CallRecord {
 id: number;
 endpoint: string;
 symbol: string;
 status: CallStatus;
}

export interface Quote {
 symbol: string;
 price: number;
}

export interface HistoryPoint {
 at: number;
 price: number;
}

export interface MarketApiOptions {
 /** Base latency in ms for every request. Default 40. */
 latency?: number;
 /** Optional trace sink; pass console.log in a demo to watch requests. */
 trace?: (line: string) => void;
}

// Structural signal so this file does not depend on DOM lib types.
export interface AbortSignalLike {
 readonly aborted: boolean;
 addEventListener?: (type: 'abort', listener: () => void) => void;
 removeEventListener?: (type: 'abort', listener: () => void) => void;
}

export class AbortError extends Error {
 override readonly name = 'AbortError';
 constructor(message = 'The operation was aborted') {
 super(message);
 }
}

export function isAbortError(error: unknown): error is { name: 'AbortError' } {
 return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

const BASE_PRICE: Record<string, number> = { BTC: 64000, ETH: 3400, SOL: 150, AAPL: 224, TSLA: 250 };

export class MarketApi {
 readonly calls: CallRecord[] = [];
 private readonly latency: number;
 private readonly trace: (line: string) => void;
 private nextId = 1;
 private tick = 0;

 constructor(options: MarketApiOptions = {}) {
 this.latency = options.latency ?? 40;
 this.trace = options.trace ?? (() => {});
 }

 reset(): void {
 this.calls.length = 0;
 }

 /** Every completed request for this symbol, whatever its status. */
 callsFor(symbol: string): CallRecord[] {
 return this.calls.filter((c) => c.symbol === symbol);
 }

 quote(symbol: string, signal?: AbortSignalLike): Promise<Quote> {
 const base = BASE_PRICE[symbol] ?? 100;
 return this.respond('prices.quote', symbol, () => ({ symbol, price: Number((base * (1 + this.drift())).toFixed(2)) }), signal);
 }

 history(symbol: string, signal?: AbortSignalLike): Promise<HistoryPoint[]> {
 const base = BASE_PRICE[symbol] ?? 100;
 return this.respond(
 'prices.history',
 symbol,
 () => Array.from({ length: 12 }, (_, i) => ({ at: i, price: Number((base * (1 + this.drift())).toFixed(2)) })),
 signal
 );
 }

 private drift(): number {
 this.tick = (this.tick + 1) % 20;
 return (this.tick - 10) / 400;
 }

 private respond<T>(endpoint: string, symbol: string, produce: () => T, signal?: AbortSignalLike): Promise<T> {
 const record: CallRecord = { id: this.nextId++, endpoint, symbol, status: 'started' };
 this.calls.push(record);
 this.trace(`[market-api] #${record.id} ${endpoint}(${symbol}) started`);

 return new Promise<T>((resolve, reject) => {
 const settleAborted = () => {
 detach();
 record.status = 'aborted';
 this.trace(`[market-api] #${record.id} ${endpoint}(${symbol}) aborted`);
 reject(new AbortError());
 };

 if (signal?.aborted) {
 record.status = 'aborted';
 this.trace(`[market-api] #${record.id} ${endpoint}(${symbol}) aborted`);
 reject(new AbortError());
 return;
 }

 const timer = setTimeout(() => {
 detach();
 record.status = 'completed';
 this.trace(`[market-api] #${record.id} ${endpoint}(${symbol}) completed`);
 resolve(produce());
 }, this.latency);

 const onAbort = () => {
 clearTimeout(timer);
 settleAborted();
 };
 signal?.addEventListener?.('abort', onAbort);
 const detach = () => signal?.removeEventListener?.('abort', onAbort);
 });
 }
}

export function createMarketApi(options?: MarketApiOptions): MarketApi {
 return new MarketApi(options);
}
