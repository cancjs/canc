// Watchlist store, vanilla mobx flavor. Cancellation here is mobx's own: a flow driven by
// `flow(...)`, canceled with `flowResult(run).cancel()`. This is the best mobx offers out of the
// box, and it is a SHALLOW cancel: canceling stops the generator, but any request already in
// flight keeps running to completion. Switching symbols therefore leaves the previous symbol's
// quote+history requests burning in the background, and their results are simply discarded.

import { configure, makeObservable, observable, flow, flowResult, action } from 'mobx';
import type { CancellablePromise } from 'mobx';
import { WATCHLIST, makeMarketApi } from './portfolio';
import type { Symbol, Loaded, MarketApi } from './portfolio';

// Same strict mode both twins run under, so the -canc store's action wrapping is a fair comparison.
configure({ enforceActions: 'always' });

export class PortfolioStore {
 symbols = WATCHLIST;
 selected: Symbol = 'BTC';
 loaded: Loaded | null = null;
 loading = false;

 private readonly api: MarketApi;
 private pending: CancellablePromise<void> | null = null;

 constructor(api: MarketApi = makeMarketApi()) {
 this.api = api;
 makeObservable(this, {
 selected: observable,
 loaded: observable.ref,
 loading: observable,
 select: action,
 loadSymbol: flow,
 });
 }

 select(symbol: Symbol): void {
 // Cancel the previous flow before starting the next. flowResult(...).cancel() stops the
 // generator, but the quote+history requests it already issued keep running (the shallow gap).
 if (this.pending) flowResult(this.pending).cancel();
 this.selected = symbol;
 this.pending = flowResult(this.loadSymbol(symbol)) as unknown as CancellablePromise<void>;
 // Swallow the cancellation rejection flowResult surfaces so it does not become unhandled.
 Promise.resolve(this.pending).catch(() => {});
 }

 *loadSymbol(symbol: Symbol): Generator<Promise<any>, void, any> {
 this.loading = true;
 // No AbortSignal is threaded: mobx flow cannot abort the underlying request, only skip the
 // code after the yield once canceled. The request completes anyway (wasted work).
 const quote = yield this.api.quote(symbol);
 const history = yield this.api.history(symbol);
 // On cancel the generator never reaches here, so no stale write happens for THIS store field.
 // But the requests above still ran to completion server-side (see the completed markers).
 this.loaded = { symbol, quote, history };
 this.loading = false;
 }
}
