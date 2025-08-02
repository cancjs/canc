// Headless boot for the legacy-decorators flavor. It lives inside the legacy folder so the runner
// picks up this folder's tsconfig (experimentalDecorators: true) when compiling the store.

import { PortfolioStore } from './store-legacy';
import { makeMarketApi } from '../../portfolio';

async function main(): Promise<void> {
 const api = makeMarketApi((line) => console.log(line));
 const store = new PortfolioStore(api);

 store.select('BTC');
 await delay(10);
 store.select('ETH');
 await delay(120);

 const btc = api.callsFor('BTC');
 console.log('\nflavor: legacy');
 console.log(`BTC requests: ${btc.map((c) => c.status).join(', ')}`);
 console.log(`aborted after switch: ${btc.filter((c) => c.status === 'aborted').length}`);
 console.log(`final loaded symbol: ${store.loaded?.symbol}`);
 console.log('Done.');
}

function delay(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
