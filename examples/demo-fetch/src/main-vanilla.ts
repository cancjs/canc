import { createMockFetch, MockApi } from '../../_shared/mock-api/src/index';
import { sleep } from '../../_shared/util/src/index';
import {
  searchRepos,
  searchReposPreAborted,
  searchReposWithExternal,
  searchReposWithTimeout,
} from './repo-search-vanilla';

async function main() {
  const api = new MockApi({ seedMode: true, trace: console.log });
  const fetch = createMockFetch(api);

  console.log('\n=== Scenario 1: uncancelable (bloat) ===');
  api.reset();
  try {
    // Uses /products (search) and /products/:id (fetch details of top hit).
    const result = await searchRepos('', fetch);
    console.log('Result:', result.name, result.id);
    console.log('Calls:', api.calls.map((c) => `${c.id}:${c.endpoint}:${c.status}`).join(', '));
  } catch (e) {
    console.error('Error:', (e as Error).message);
  }

  console.log('\n=== Scenario 2: workaround with AbortController ===');
  api.reset();
  try {
    const controller = new AbortController();
    const promise = searchReposWithExternal('', fetch, controller.signal);
    // Simulate external abort mid-detail fetch (after search completes).
    await sleep(50);
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

  console.log('\n=== Scenario 4: timeout (tight deadline) ===');
  api.reset();
  try {
    const result = await searchReposWithTimeout('', fetch, 30);
    console.log('Result:', result.name);
  } catch (e) {
    console.error('Error:', (e as Error).message);
    console.log('Calls:', api.calls.map((c) => `${c.id}:${c.endpoint}:${c.status}`).join(', '));
  }

  console.log('\nAll scenarios done.');
}

main().catch(console.error);
