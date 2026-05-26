import { sleep } from '../../_shared/util/src/index';
import { createMockFetch, MockApi } from '../../_shared/mock-api/src/index';
import {
 searchRepos,
 searchReposWithExternal,
 searchReposPreAborted,
 searchReposWithTimeout,
} from './repo-search-canc';

async function main() {
 const api = new MockApi({ seedMode: true, latency: 0, trace: console.log });
 const fetch = createMockFetch(api);

 console.log('\n=== Scenario 1: chain cancellation (cancel mid-detail fetch) ===');
 api.reset();
 try {
 const promise = searchRepos('', fetch);
 // Simulate caller canceling mid-detail fetch (delay is near-instant in seed mode).
 await sleep(1);
 promise.cancel();
 const result = await promise;
 console.log('Result:', result.name);
 } catch (e) {
 console.error('Error:', (e as Error).message);
 console.log('Calls:', api.calls.map((c) => `${c.id}:${c.endpoint}:${c.status}`).join(', '));
 }

 console.log('\n=== Scenario 2: external abort signal ===');
 api.reset();
 try {
 // Demonstrates external AbortSignal driving fetch cancellation.
 const controller = new AbortController();
 const promise = searchReposWithExternal('', fetch, controller.signal);
 // External abort mid-detail fetch.
 await sleep(1);
 controller.abort();
 const result = await promise;
 console.log('Result:', result.name);
 } catch (e) {
 console.error('Error:', (e as Error).message);
 console.log('Calls:', api.calls.map((c) => `${c.id}:${c.endpoint}:${c.status}`).join(', '));
 }

 console.log('\n=== Scenario 3: pre-aborted signal (born-canceled) ===');
 api.reset();
 try {
 const result = await searchReposPreAborted('', fetch);
 console.log('Result:', result.name);
 } catch (e) {
 console.error('Error:', (e as Error).message);
 console.log('Calls (none expected):', api.calls.map((c) => `${c.id}:${c.endpoint}:${c.status}`).join(', '));
 }

 console.log('\n=== Scenario 4: timeout composition (timeout wins) ===');
 api.reset();
 try {
 // With 0 latency, timeout must be negative to trigger immediately.
 const result = await searchReposWithTimeout('', fetch, 0);
 console.log('Result:', result.name);
 } catch (e) {
 console.error('Error:', (e as Error).message);
 console.log('Calls:', api.calls.map((c) => `${c.id}:${c.endpoint}:${c.status}`).join(', '));
 }

 console.log('\nAll scenarios done.');
}

main().catch(console.error);
