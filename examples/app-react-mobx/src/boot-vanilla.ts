// Headless boot for the vanilla store: drives a symbol switch and prints the market-api call log so
// the shallow-cancel gap is visible without a browser. `dev:vanilla` serves the real React app.

import { sleep } from '@shared/util';
import { PortfolioStore } from './portfolio-store-vanilla';
import { makeMarketApi } from './portfolio';

async function main(): Promise<void> {
 const api = makeMarketApi((line) => console.log(line));
 const store = new PortfolioStore(api);

 store.select('BTC');
 // Switch away before BTC's requests finish. The vanilla flow cancels the generator, but the BTC
 // quote+history requests keep running and complete anyway.
 await sleep(10);
 store.select('ETH');
 await sleep(120);

 const btc = api.callsFor('BTC');
 console.log(`\nBTC requests: ${btc.map((c) => c.status).join(', ')}`);
 console.log(`completed after switch: ${btc.filter((c) => c.status === 'completed').length}`);
 console.log(`final loaded symbol: ${store.loaded?.symbol}`);
 console.log('Done.');
}

main();
