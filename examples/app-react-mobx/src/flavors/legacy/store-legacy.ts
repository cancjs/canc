// Watchlist store, legacy-decorators flavor. Both mobx and canc run on TypeScript legacy
// decorators (`experimentalDecorators: true`), configured by this folder's own tsconfig. mobx
// legacy decorators need `makeObservable(this)` in the constructor; canc uses LegacyAsyncMethod.
// Behavior matches the other flavors: canceling the run aborts the request in flight.

import { configure, observable, action, makeObservable } from 'mobx';
import { LegacyAsyncMethod } from '@cancjs/decorators';
import type { CancelablePromise } from '@cancjs/promise';
import { WATCHLIST, makeMarketApi } from '../../portfolio';
import type { Symbol, Loaded, Quote, HistoryPoint, MarketApi } from '../../portfolio';

configure({ enforceActions: 'always' });

interface LoadResult {
 quote: Quote;
 history: HistoryPoint[];
}

class QuoteLoader {
 private controller = new AbortController();

 constructor(private readonly api: MarketApi) {}

 @LegacyAsyncMethod()
 *load(symbol: Symbol): Generator<Promise<any>, LoadResult, any> {
 this.controller = new AbortController();
 const quote = yield this.api.quote(symbol, this.controller.signal);
 const history = yield this.api.history(symbol, this.controller.signal);
 return { quote, history };
 }

 abort(): void {
 this.controller.abort();
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
