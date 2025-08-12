import { sleep } from '@shared/util';
import { PortfolioStore as CancStore } from '../src/portfolio-store-canc';
import { PortfolioStore as StandardStore } from '../src/flavors/store-standard';
import { PortfolioStore as VanillaStore } from '../src/portfolio-store-vanilla';
import { makeMarketApi } from '../src/portfolio';

// Requests settle on a real 40ms timer; a cancel is synchronous. So selecting then immediately
// re-selecting cancels while the first symbol's requests are still pending. Waiting past the
// latency lets whatever survived complete. No arbitrary sleeps: the two waits bracket one latency.

describe('canc store: deep cancel', () => {
 it('aborts the previous symbol requests on switch and writes only the last symbol', async () => {
 const api = makeMarketApi();
 const store = new CancStore(api);

 store.select('BTC');
 store.select('ETH');
 await sleep(120);

 const btc = api.callsFor('BTC');
 expect(btc.length).toBeGreaterThan(0);
 expect(btc.some((c) => c.status === 'aborted')).toBe(true);
 expect(btc.some((c) => c.status === 'completed')).toBe(false);
 expect(store.loaded?.symbol).toBe('ETH');
 });

 it('does not emit mobx strict-mode warnings', async () => {
 const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
 const api = makeMarketApi();
 const store = new CancStore(api);

 store.select('BTC');
 store.select('ETH');
 await sleep(120);

 const mobxWarnings = warn.mock.calls.flat().filter((arg) => typeof arg === 'string' && /\[MobX\]/.test(arg));
 expect(mobxWarnings).toEqual([]);
 warn.mockRestore();
 });
});

describe('standard-decorators flavor: deep cancel', () => {
 it('aborts the previous symbol requests on switch and writes only the last symbol', async () => {
 const api = makeMarketApi();
 const store = new StandardStore(api);

 store.select('BTC');
 store.select('ETH');
 await sleep(120);

 const btc = api.callsFor('BTC');
 expect(btc.some((c) => c.status === 'aborted')).toBe(true);
 expect(store.loaded?.symbol).toBe('ETH');
 });
});

describe('vanilla store: shallow cancel (the gap we teach)', () => {
 it('lets the abandoned symbol requests complete anyway', async () => {
 const api = makeMarketApi();
 const store = new VanillaStore(api);

 store.select('BTC');
 store.select('ETH');
 await sleep(120);

 const btc = api.callsFor('BTC');
 // mobx flow cannot abort the underlying request: both BTC requests complete despite the switch.
 expect(btc.filter((c) => c.status === 'completed').length).toBeGreaterThan(0);
 expect(btc.some((c) => c.status === 'aborted')).toBe(false);
 });
});
