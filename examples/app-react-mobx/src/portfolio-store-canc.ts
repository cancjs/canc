// Watchlist store, canc flavor (default: makeAutoObservable). Cancellation here is deep: loadSymbol
// runs through cancFlow, which returns a CancelablePromise. Canceling it aborts the in-flight
// quote+history request (via an AbortSignal derived from the run) and skips every downstream step,
// so no stale state is written for an abandoned symbol.

import { configure, makeAutoObservable, action } from 'mobx';
import { createAbortSignal, type CancelablePromise } from '@cancjs/promise';
import { cancFlow } from './lib/canc-flow';
import { WATCHLIST, makeMarketApi } from './portfolio';
import type { Symbol, Loaded, MarketApi } from './portfolio';

// Same strict mode both twins run under. cancFlow keeps this clean by wrapping generator re-entry.
configure({ enforceActions: 'always' });

export class PortfolioStore {
 symbols = WATCHLIST;
 selected: Symbol = 'BTC';
 loaded: Loaded | null = null;
 loading = false;

 private readonly api: MarketApi;
 private pending: CancelablePromise<void> | null = null;

 constructor(api: MarketApi = makeMarketApi()) {
 this.api = api;
 // makeAutoObservable infers generators as `flow`. loadSymbol is NOT a mobx flow here (it is a
 // cancFlow), so it must be annotated `action` explicitly, otherwise mobx wraps it as a flow and
 // the cancFlow driver fights mobx's. This is the auto-observable trap for cancFlow methods.
 makeAutoObservable(this, { loadSymbol: action }, { autoBind: true });
 }

 select(symbol: Symbol): void {
 // Cancel the previous run before starting the next. Unlike flowResult(...).cancel(), this
 // aborts the request already in flight, not just the generator.
 if (this.pending) this.pending.cancel();
 this.selected = symbol;
 this.pending = this.loadSymbol(symbol);
 // Cancellation surfaces as a rejected CancelError; suppress it so it is not unhandled.
 this.pending.catch(() => {});
 }

 loadSymbol(symbol: Symbol): CancelablePromise<void> {
 // The signal aborts the request at the network the moment this run is canceled, so a stale
 // symbol's quote+history are cut off in flight instead of running to completion.
 const cancelSignal = createAbortSignal();
 const run = cancFlow(function* (this: PortfolioStore): Generator<Promise<any>, void, any> {
 this.loading = true;
 const quote = yield this.api.quote(symbol, cancelSignal.signal);
 const history = yield this.api.history(symbol, cancelSignal.signal);
 // Reached only when the run was not canceled: safe to write, this is still the current symbol.
 this.loaded = { symbol, quote, history };
 this.loading = false;
 }, this)();
 run.catch(() => cancelSignal.abort());
 return run;
 }
}
