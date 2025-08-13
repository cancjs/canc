import { createMockApi, type MockApiBundle } from '@shared/mock-api';
import { loadProductProfile } from './page-load-vanilla';
import { report } from './report';

type ProductsApi = MockApiBundle['products'];
type MusicApi = MockApiBundle['music'];
type InvoicesApi = MockApiBundle['invoices'];

async function runScenarios(): Promise<void> {
 const mockApi = createMockApi();
 const { products: productsApi, music: musicApi, invoices: invoicesApi } = mockApi;

 // Scenario 1: Down (source canceled mid-chain)
 console.log('\n=== Scenario 1: Down (source canceled) ===');
 await runDownScenario(mockApi, productsApi, musicApi, invoicesApi);

 // Scenario 2: Up/bubble (both consumers canceled)
 console.log('\n=== Scenario 2: Up/bubble (consumers canceled) ===');
 await runBubbleScenario(mockApi, productsApi, musicApi, invoicesApi);

 // Scenario 3: Partial (one consumer canceled)
 console.log('\n=== Scenario 3: Partial (one consumer canceled) ===');
 await runPartialScenario(mockApi, productsApi, musicApi, invoicesApi);

 // Scenario 4: Shield (audit survives)
 console.log('\n=== Scenario 4: Shield (audit isolated) ===');
 await runShieldScenario(mockApi, productsApi, musicApi, invoicesApi);
}

async function runDownScenario(
 mockApi: MockApiBundle,
 productsApi: ProductsApi,
 musicApi: MusicApi,
 invoicesApi: InvoicesApi
): Promise<void> {
 report('starting product load');
 const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'prod-1');

 // Simulate: user leaves before completion.
 // In vanilla, there is no way to cancel from here.
 // Result: keeps running, nobody can stop this from the consumer side.
 report('(cannot cancel from here in vanilla)');
 report('user abandoned page');

 try {
 // orphaned result: computed, delivered to no one
 await profilePromise;
 } catch (_err) {
 report('load failed');
 }

 report('log: remaining calls completed anyway');
 console.log('Mock API calls:', mockApi.api.calls.map(c => `${c.endpoint}(${c.status})`).join(', '));
}

async function runBubbleScenario(
 mockApi: MockApiBundle,
 productsApi: ProductsApi,
 musicApi: MusicApi,
 invoicesApi: InvoicesApi
): Promise<void> {
 report('starting product load');
 const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'prod-2');

 // In vanilla, you might keep the promise around and hope nothing else happens.
 report('user abandoned page (no cancellation possible)');

 try {
 await profilePromise;
 } catch (_err) {
 report('load failed');
 }

 report('completed');
 console.log('Mock API calls:', mockApi.api.calls.map(c => `${c.endpoint}(${c.status})`).join(', '));
}

async function runPartialScenario(
 mockApi: MockApiBundle,
 productsApi: ProductsApi,
 musicApi: MusicApi,
 invoicesApi: InvoicesApi
): Promise<void> {
 report('starting product load');
 const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'prod-3');

 report('user abandoned page (no selective cancellation)');

 try {
 await profilePromise;
 } catch (_err) {
 report('load failed');
 }

 report('completed');
 console.log('Mock API calls:', mockApi.api.calls.map(c => `${c.endpoint}(${c.status})`).join(', '));
}

async function runShieldScenario(
 mockApi: MockApiBundle,
 productsApi: ProductsApi,
 musicApi: MusicApi,
 invoicesApi: InvoicesApi
): Promise<void> {
 report('starting product load');
 const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'prod-4');

 report('user abandoned page');

 try {
 await profilePromise;
 } catch (_err) {
 report('load failed');
 }

 report('completed');
 console.log('Mock API calls:', mockApi.api.calls.map(c => `${c.endpoint}(${c.status})`).join(', '));
}

runScenarios().catch(console.error);
