import { createMockApi, type MockApiBundle } from '@shared/mock-api';

import { loadProductProfile } from './page-load-canc';
import { report } from './report';

type ProductsApi = MockApiBundle['products'];
type MusicApi = MockApiBundle['music'];
type InvoicesApi = MockApiBundle['invoices'];
type MockApi = MockApiBundle['api'];

async function runScenarios(): Promise<void> {
  const { api, products: productsApi, music: musicApi, invoices: invoicesApi } = createMockApi();

  // Scenario 1: Down (source canceled mid-chain)
  console.log('\n=== Scenario 1: Down (source canceled) ===');
  await runDownScenario(api, productsApi, musicApi, invoicesApi);

  // Scenario 2: Up/bubble (both consumers canceled)
  console.log('\n=== Scenario 2: Up/bubble (consumers canceled) ===');
  await runBubbleScenario(api, productsApi, musicApi, invoicesApi);

  // Scenario 3: Partial (one consumer canceled)
  console.log('\n=== Scenario 3: Partial (one consumer canceled) ===');
  await runPartialScenario(api, productsApi, musicApi, invoicesApi);

  // Scenario 4: Shield (audit survives)
  console.log('\n=== Scenario 4: Shield (audit isolated) ===');
  await runShieldScenario(api, productsApi, musicApi, invoicesApi);
}

async function runDownScenario(
  api: MockApi,
  productsApi: ProductsApi,
  musicApi: MusicApi,
  invoicesApi: InvoicesApi,
): Promise<void> {
  report('starting product load');
  const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'p1');

  // Simulate: user leaves before completion.
  // Calling cancel() on the promise immediately rejects with CancelError.
  // All downstream requests abort.
  report('canceling source');
  profilePromise.cancel();

  try {
    // canceled here, nothing below runs
    await profilePromise;
  } catch (err) {
    report(`load canceled: ${err instanceof Error ? err.constructor.name : String(err)}`);
  }

  report('source aborted successfully');
  console.log('Mock API calls:', api.calls.map((c) => `${c.endpoint}(${c.status})`).join(', '));
}

async function runBubbleScenario(
  api: MockApi,
  productsApi: ProductsApi,
  musicApi: MusicApi,
  invoicesApi: InvoicesApi,
): Promise<void> {
  report('starting product load');
  const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'p2');

  report('user abandoned page');
  // Cancel both the image and reviews consumers, which triggers bubble-up:
  // the source's own cancel handler fires.
  report('simulating: both consumers canceled');
  profilePromise.cancel();

  try {
    // canceled here, nothing below runs
    await profilePromise;
  } catch (err) {
    report(`load canceled: ${err instanceof Error ? err.constructor.name : String(err)}`);
  }

  report('source aborted (bubble-up from both consumers)');
  console.log('Mock API calls:', api.calls.map((c) => `${c.endpoint}(${c.status})`).join(', '));
}

async function runPartialScenario(
  api: MockApi,
  productsApi: ProductsApi,
  musicApi: MusicApi,
  invoicesApi: InvoicesApi,
): Promise<void> {
  report('starting product load');
  const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'p3', { bubble: false });

  report('user abandoned page');
  // Cancel the image consumer only. Since image has bubble:false, its cancellation
  // does NOT bubble up to the source. The source keeps running because reviews is still active.
  report('simulating: image consumer canceled (bubble:false)');
  profilePromise.cancel();

  try {
    // canceled here, nothing below runs
    await profilePromise;
  } catch (err) {
    report(`load canceled: ${err instanceof Error ? err.constructor.name : String(err)}`);
  }

  // When one consumer is isolated (bubble:false), the source does NOT cancel.
  // It completes normally.
  report('source completed (image isolated via bubble:false)');
  console.log('Mock API calls:', api.calls.map((c) => `${c.endpoint}(${c.status})`).join(', '));
}

async function runShieldScenario(
  api: MockApi,
  productsApi: ProductsApi,
  musicApi: MusicApi,
  invoicesApi: InvoicesApi,
): Promise<void> {
  report('starting product load');
  const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'p4', { shield: true });

  report('canceling source');
  // Even though the source is canceled, the audit-log node (shielded) survives the cancellation.
  // However, upstream rejection (from the canceled source) is still adopted: the shield does not
  // stop the CancelError from being passed down.
  profilePromise.cancel();

  try {
    // canceled here, nothing below runs
    await profilePromise;
  } catch (err) {
    report(`load canceled: ${err instanceof Error ? err.constructor.name : String(err)}`);
  }

  report('audit completed despite source cancellation (shield:true)');
  console.log('Mock API calls:', api.calls.map((c) => `${c.endpoint}(${c.status})`).join(', '));
}

runScenarios().catch(console.error);
