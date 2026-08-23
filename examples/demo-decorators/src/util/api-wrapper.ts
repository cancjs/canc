import type { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

import type { Issue, IssuesApi } from '../issue-types.js';

/**
 * A cancelable wrapper for the IssuesApi list call.
 * Uses cancelify to automatically manage the AbortSignal for the query.
 */
export const listIssues = cancelify(({ getSignal }, issuesApi: IssuesApi): Promise<Issue[]> => {
  return issuesApi.list(getSignal());
}) as (issuesApi: IssuesApi) => CancelablePromise<Issue[]>;
