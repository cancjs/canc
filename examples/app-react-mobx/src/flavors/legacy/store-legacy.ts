// Watchlist store, legacy-decorators flavor. Both mobx and canc run on TypeScript legacy
// decorators (`experimentalDecorators: true`), configured by this folder's own tsconfig. mobx
// legacy decorators need `makeObservable(this)` in the constructor; canc uses the legacy subpath's
// AsyncMethod. Behavior matches the other flavors: canceling the run aborts the request in flight.

import { configure, observable, action, makeObservable } from 'mobx';
import { AsyncMethod } from '@cancjs/decorators/legacy';
import { createAbortSignal, type CancelablePromise } from '@cancjs/promise';
import { WATCHLIST, makeMarketApi } from '../../portfolio';
import type { Symbol, Loaded, Quote, HistoryPoint, MarketApi } from '../../portfolio';

configure({ enforceActions: 'always' });

interface LoadResult {
 quote: Quote;
 history: HistoryPoint[];
}

// Loader client: the legacy-decorator @AsyncMethod turns the generator into a CancelablePromise-
// returning method. It mints one canc-aware signal per run so canceling the returned run aborts
// the request in flight and reads as a genuine cancellation, not a bare DOMException.
class QuoteLoader {
 private cancelSignal = createAbortSignal();

 constructor(private readonly api: MarketApi) {}

 @AsyncMethod()
 *load(symbol: Symbol): Generator<Promise<any>, LoadResult, any> {
 this.cancelSignal = createAbortSignal();
 const quote = yield this.api.quote(symbol, this.cancelSignal.signal);
 const history = yield this.api.history(symbol, this.cancelSignal.signal);
 return { quote, history };
 }

 abort(): void {
 this.cancelSignal.abort();
 }
}

export class PortfolioStore {
 @observable selected: Symbol = 'BTC';
 @observable.ref loaded: Loaded | null = null;
 @observable loading = false;
 readonly symbols = WATCHLIST;

 private readonly loader: QuoteLoader;
 private pending: CancelablePromise<LoadResult> | null = null;

 constructor(api: MarketApi = makeMarketApi()) {
 // Legacy decorators require makeObservable(this) to apply the annotations.
 makeObservable(this);
 this.loader = new QuoteLoader(api);
 }

 @action
 select(symbol: Symbol): void {
 if (this.pending) {
 this.pending.cancel();
 this.loader.abort();
 }
 this.selected = symbol;
 this.loading = true;
 const run = this.loader.load(symbol) as unknown as CancelablePromise<LoadResult>;
 this.pending = run;
 run.then(action((result: LoadResult) => this.apply(symbol, result)));
 run.catch(() => {});
 }

 @action
 private apply(symbol: Symbol, result: LoadResult): void {
 this.loaded = { symbol, ...result };
 this.loading = false;
 }
}
