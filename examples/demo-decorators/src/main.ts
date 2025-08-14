// Runs the shared scenario against one flavor and prints an identical output block regardless of
// which wiring produced the IssueClient. Flavor comes from argv so each npm script can target one
// (the stage-3 and TS-legacy flavors need different compiler flags, so they cannot share a single
// tsx process; each start script points tsx at the matching tsconfig).
//
// Usage: tsx src/main.ts <stage3 | ts-legacy | manual>
// The babel-legacy flavor needs babel's transform and is exercised by the smoke test, not here.

import { createMockApi } from '@shared/mock-api';
import { runScenario } from './scenario.js';
import type { IssueClientShape, IssuesApi } from './issue-types.js';

type Flavor = 'stage3' | 'ts-legacy' | 'manual';
type ClientCtor = new (issuesApi: IssuesApi) => IssueClientShape;

// manual has no decorator, so its fields keep their own declared Promise-returning type and match
// ClientCtor with no cast. stage3 and ts-legacy decorate the getters: a stage-3 decorator with a
// non-void return type redefines the decorated member's type to the decorator's own declared
// return, so the class no longer structurally matches ClientCtor from the outside even though
// every call site still gets a real CancelablePromise at runtime.
async function loadClientClass(flavor: Flavor): Promise<ClientCtor> {
 switch (flavor) {
 case 'stage3':
 return (await import('./stage3/issue-client.js')).IssueClient as unknown as ClientCtor;
 case 'ts-legacy':
 return (await import('./ts-legacy/issue-client.js')).IssueClient as unknown as ClientCtor;
 case 'manual':
 return (await import('./manual/issue-client.js')).IssueClient;
 default:
 throw new Error(`unknown flavor: ${flavor as string}`);
 }
}

async function main(): Promise<void> {
 const flavor = (process.argv[2] as Flavor) ?? 'stage3';
 const IssueClient = await loadClientClass(flavor);

 const { issues } = createMockApi({ latency: 40, jitter: 0 });
 const clientA = new IssueClient(issues);
 const clientB = new IssueClient(issues);

 console.log(`--- ${flavor} ---`);
 const result = await runScenario(clientA, clientB);
 for (const line of result.lines) console.log(line);
 console.log(`isolation: clientA canceled=${result.clientACanceled}, clientB resolved=${result.clientBResolved}`);
}

main().catch((error) => {
 console.error(error);
 process.exit(1);
});
