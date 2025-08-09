import { createMockApi } from '@shared/mock-api';
import { runScenario } from './scenario.js';
import type { IssueClientShape, MockApiBundle } from './issue-types.js';

import { IssueClient as Stage3Client } from './stage3/issue-client.js';
import { IssueClient as TsLegacyClient } from './ts-legacy/issue-client.js';
import { IssueClient as ManualClient } from './manual/issue-client.js';
// The babel-legacy flavor is a plain .js file transformed by babel-jest (see jest.config.js
// transform). It has no type declarations, so its import is untyped here on purpose.
// @ts-expect-error no declaration for the untyped .js flavor
import { IssueClient as BabelLegacyClient } from './babel-legacy/issue-client.js';

type ClientCtor = new (api: MockApiBundle) => IssueClientShape;

// manual has no decorator, so its fields keep their own declared Promise-returning type and
// satisfy ClientCtor with no cast. stage3 and ts-legacy decorate the getters: a stage-3 decorator
// with a non-void return type redefines the decorated member's type to the decorator's own
// declared return (AsyncMethod/BindMethod return `any`), so the class no longer structurally
// matches ClientCtor from the outside even though every call site still gets a real
// CancelablePromise at runtime. babel-legacy is untyped JS (see the import above).
const flavors: Array<[string, ClientCtor]> = [
 ['stage3', Stage3Client as unknown as ClientCtor],
 ['ts-legacy', TsLegacyClient as unknown as ClientCtor],
 ['babel-legacy', BabelLegacyClient as unknown as ClientCtor],
 ['manual', ManualClient],
];

describe('demo-decorators: every flavor runs the same scenario', () => {
 it.each(flavors)('%s: cancel is a CancelError and instances are isolated', async (_name, IssueClient) => {
 // Fixed, small latency (no jitter) keeps the cancel deterministic: the request is still in
 // flight when clientA cancels, so the abort reaches the simulated request boundary.
 const mockApi = createMockApi({ latency: 20, jitter: 0 });
 const clientA = new IssueClient(mockApi);
 const clientB = new IssueClient(mockApi);

 const result = await runScenario(clientA, clientB);

 // Canceling clientA surfaced as a CancelError through ordinary try/catch.
 expect(result.clientACanceled).toBe(true);
 // clientB's independent call resolved — the historical lateBindMethod cross-instance bug
 // would have canceled B's in-flight call too. This one assert guards that isolation.
 expect(result.clientBResolved).toBe(true);

 // The mock API logged an abort, proving cancel reached the simulated request boundary.
 const aborted = mockApi.api.calls.find((call) => call.status === 'aborted');
 expect(aborted).toBeDefined();
 });
});
