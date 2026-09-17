import '@cancjs/unhandled-rejection/register';

import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';
import axios from 'axios';

import { CancIssuesClient } from './issues-client-canc';
import { toAxiosAdapter } from './mock-adapter';

async function main() {
  const mockBundle = createMockApi();

  // Inject the mock adapter into axios.
  const instance = axios.create({
    adapter: toAxiosAdapter(mockBundle),
  });

  const client = new CancIssuesClient(instance);

  console.log('Scenario: search supersedes old search (canc direct cancel)');

  // Start a search.
  const _search1Promise = client.searchIssues('bug');
  console.log(' Search 1 started for query "bug"');

  // Before search1 completes, start search2.
  // The wrapper makes the returned promise cancelable.
  // searchIssues internally cancels search1 before starting search2.
  const search2Promise = client.searchIssues('feature');
  console.log(' Search 2 started for query "feature" (search 1 canceled internally)');

  // Await both (Search 1 settles as canceled, search 2 completes).
  const result2 = await search2Promise.catch((err) => {
    // The failure set is declared, so err is narrowed to AxiosError | CancelError.
    if (isCancelError(err)) {
      console.log(' Search 2 canceled');
    } else {
      console.error(` Search 2 rejected: ${err.message}`);
    }
    return { issues: [], query: 'feature' };
  });

  console.log(` Search 2 result: ${result2.issues.length} issues`);

  // Clean up.
  client.cancelSearch();
  console.log(' Cleanup: called cancelSearch() (search already settled)');

  console.log('Done.');
}

main().catch(console.error);
