import { createMockApi } from '@shared/mock-api';
import { compareVanilla, firstQuote } from './compare-vanilla';
import { crawlVanilla, crawlAllSuppliers } from './crawl-vanilla';
import { TARGET_PART } from './aux/catalog';

async function main(): Promise<void> {
 // Scenario 1: race N suppliers for the first quote. Losers keep running (wasted supplier calls).
 console.log('--- scenario 1: any() first quote wins ---');
 await compareVanilla(createMockApi({ latency: 60, jitter: 30 }));

 // Scenario 2: crawl catalogs, abandon early. No cancel path, so every page still fetches.
 console.log('\n--- scenario 2: abandon crawl mid-flight ---');
 await crawlVanilla(createMockApi({ latency: 60, jitter: 30 }));

 // Scenario 3: crawl to find the part, then quote it across suppliers, abandoning midway.
 console.log('\n--- scenario 3: crawl then quote, abandoned midway ---');
 const mockApi = createMockApi({ latency: 60, jitter: 30 });
 const { result, cancel } = crawlAllSuppliers(mockApi);
 setTimeout(cancel, 30); // no-op — the crawl cannot be stopped
 await result;
 const winner = await firstQuote(mockApi, TARGET_PART);
 await new Promise((resolve) => setTimeout(resolve, 120));
 const pageStarted = mockApi.api.calls.filter((call) => call.endpoint === 'catalog.page').length;
 const quoteCompleted = mockApi.api.calls.filter(
 (call) => call.endpoint === 'catalog.quote' && call.status === 'completed'
 ).length;
 console.log(`vanilla: winner ${winner.supplierId}; page fetches = ${pageStarted}, quotes completed = ${quoteCompleted} (all ran)`);
}

main();
