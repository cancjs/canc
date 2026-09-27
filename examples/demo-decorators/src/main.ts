// Runs the shared scenario against one flavor chosen via argv to print an identical output block.
// stage-3 and TS-legacy need different compiler flags; each gets its own process
//
// Usage: tsx src/main.ts <stage3 | ts-legacy | manual>
// The babel-legacy flavor needs babel's transform and is exercised by the smoke test, not here.

import '@cancjs/unhandled-rejection/register';

import { createMockApi } from '@shared/mock-api';

import type { IssueClientShape, IssuesApi } from './issue-types.js';
import { runScenario } from './scenario.js';

type Flavor = 'stage3' | 'ts-legacy' | 'manual';
type ClientCtor = new (issuesApi: IssuesApi) => IssueClientShape;

// stage3 and ts-legacy decorate getters; cast needed for external ClientCtor shape
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
