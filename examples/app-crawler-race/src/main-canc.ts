import { createMockApi } from '@shared/mock-api';
import { compareCanc, firstQuote } from './compare-canc';
import { crawlCanc, crawlAllSuppliers } from './crawl-canc';
import { TARGET_PART } from './aux/catalog';

async function main(): Promise<void> {
 // Scenario 1: race N suppliers for the first quote. Losers are aborted the instant a winner lands.
 console.log('--- scenario 1: any() first quote wins ---');
 await compareCanc(createMockApi({ latency: 60, jitter: 30 }));

 // Scenario 2: crawl catalogs, abandon early. One cancel() drains the pool: queued pages never start.
 console.log('\n--- scenario 2: abandon crawl mid-flight ---');
 await crawlCanc(createMockApi({ latency: 60, jitter: 30 }));

 // Scenario 3: crawl to find the part, then quote it across suppliers, abandoning midway.
 console.log('\n--- scenario 3: crawl then quote, abandoned midway ---');
 const mockApi = createMockApi({ latency: 60, jitter: 30 });
 const { result, cancel } = crawlAllSuppliers(mockApi);
 setTimeout(cancel, 30); // drains the pool — the crawl stops here
 try {
 await result;
 const winner = await firstQuote(mockApi, TARGET_PART);
 console.log(`canc: winner ${winner.supplierId}`);
 } catch {
 // canceled here — nothing below the crawl runs, no quotes are sent
 const pageStarted = mockApi.api.calls.filter((call) => call.endpoint === 'catalog.page').length;
 const pageAborted = mockApi.api.calls.filter(
 (call) => call.endpoint === 'catalog.page' && call.status === 'aborted'
 ).length;
 const quoteStarted = mockApi.api.calls.filter((call) => call.endpoint === 'catalog.quote').length;
 console.log(`canc: crawl canceled; page fetches = ${pageStarted}, aborted = ${pageAborted}, quotes sent = ${quoteStarted} (none)`);
 }
}

main();
