import { createMockApi } from '@shared/mock-api';
import axios from 'axios';

import { VanillaIssuesClient } from './issues-client-vanilla';

async function main() {
  const mockBundle = createMockApi();

  // Inject the mock adapter into axios (cast as AxiosAdapter).
  const instance = axios.create({
    adapter: mockBundle.axiosAdapter as any,
  });

  const client = new VanillaIssuesClient(instance);

  console.log('Scenario: search supersedes old search (vanilla registry pattern)');

  // Start a search that will take time to complete.
  const search1Promise = client.searchIssues('bug');
  console.log(' Search 1 started for query "bug"');

  // Before search1 completes, start search2.
  // In vanilla, search1 still completes but its result is discarded; resources must be cleaned up.
  const search2Promise = client.searchIssues('feature');
  console.log(' Search 2 started for query "feature" (search 1 still in-flight)');

  // Await both searches.
  const [result1, result2] = await Promise.all([search1Promise, search2Promise]);

  console.log(` Search 1 result: ${result1.issues.length} issues (discarded, not shown)`);
  console.log(` Search 2 result: ${result2.issues.length} issues`);

  // Clean up.
  client.cancelSearch();
  console.log(' Cleanup: called cancelSearch()');

  console.log('Done.');
}

main().catch(console.error);
