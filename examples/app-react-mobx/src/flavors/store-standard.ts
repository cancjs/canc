// Watchlist store, standard-decorators flavor. Same behavior as the default auto store, expressed
// with mobx 6.13+ stage-3 decorators (`@observable accessor`, `@action`) and a canc stage-3
// `@AsyncMethod` on a small loader client. Requires TS 5 native decorators (experimentalDecorators
// off, the repo default). The deep-cancel win is identical: canceling the run aborts the request.

import { configure, observable, action } from 'mobx';
import { AsyncMethod } from '@cancjs/decorators';
import { createAbortSignal, type CancelablePromise } from '@cancjs/promise';
import { WATCHLIST, makeMarketApi } from '../portfolio';
import type { Symbol, Loaded, Quote, HistoryPoint, MarketApi } from '../portfolio';

configure({ enforceActions: 'always' });

interface LoadResult {
 quote: Quote;
 history: HistoryPoint[];
}

// Loader client: canc stage-3 @AsyncMethod turns the generator into a CancelablePromise-returning
// method. It mints one canc-aware signal per run so canceling the returned run aborts the request
// in flight and reads as a genuine cancellation, not a bare DOMException.
class QuoteLoader {
 private cancelSignal = createAbortSignal();

 constructor(private readonly api: MarketApi) {}

 @AsyncMethod
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
 // Modern decorators self-register: no makeObservable in the constructor.
 @observable accessor selected: Symbol = 'BTC';
 @observable.ref accessor loaded: Loaded | null = null;
 @observable accessor loading = false;
 readonly symbols = WATCHLIST;

 private readonly loader: QuoteLoader;
 private pending: CancelablePromise<LoadResult> | null = null;

 constructor(api: MarketApi = makeMarketApi()) {
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
