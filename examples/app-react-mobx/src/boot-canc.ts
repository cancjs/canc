// Headless boot for the canc store: drives a symbol switch and prints the market-api call log so
// the deep-cancel win is visible without a browser. `dev:canc` serves the real React app.
//
// STORE_FLAVOR selects which stage-3 canc store to boot: auto (default) or standard. The legacy
// flavor compiles under a different decorator mode, so it has its own entry
// (src/flavors/legacy/boot-legacy.ts). All three share the same deep-cancel behavior; the flavor
// only changes how the store is declared.

import { sleep } from '@shared/util';
import { makeMarketApi } from './portfolio';
import type { Symbol } from './portfolio';

interface StoreLike {
 loaded: { symbol: Symbol } | null;
 select(symbol: Symbol): void;
}

async function loadStore(api: ReturnType<typeof makeMarketApi>): Promise<StoreLike> {
 const flavor = process.env.STORE_FLAVOR ?? 'auto';
 if (flavor === 'standard') return new (await import('./flavors/store-standard.js')).PortfolioStore(api);
 return new (await import('./portfolio-store-canc.js')).PortfolioStore(api);
}

async function main(): Promise<void> {
 const api = makeMarketApi((line) => console.log(line));
 const store = await loadStore(api);

 store.select('BTC');
 // Switch away before BTC's requests finish. The cancFlow run is canceled, which aborts the BTC
 // quote+history requests at the network before they complete.
 await sleep(10);
 store.select('ETH');
 await sleep(120);

 const btc = api.callsFor('BTC');
 console.log(`\nflavor: ${process.env.STORE_FLAVOR ?? 'auto'}`);
 console.log(`BTC requests: ${btc.map((c) => c.status).join(', ')}`);
 console.log(`aborted after switch: ${btc.filter((c) => c.status === 'aborted').length}`);
 console.log(`final loaded symbol: ${store.loaded?.symbol}`);
 console.log('Done.');
}

main();
