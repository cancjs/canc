// shared scenario proving method cancellation, CancelError catching, and client isolation

import type { CancelablePromise } from '@cancjs/promise';
import { isCancelError } from '@cancjs/promise';

import type { IssueClientShape } from './issue-types.js';

export interface ScenarioResult {
  lines: string[];
  clientACanceled: boolean;
  clientBResolved: boolean;
}

// cast to CancelablePromise since decorators cannot rewrite declared Promise return type
function asCancelable<T>(value: Promise<T>): CancelablePromise<T> {
  return value as unknown as CancelablePromise<T>;
}

export async function runScenario(clientA: IssueClientShape, clientB: IssueClientShape): Promise<ScenarioResult> {
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);

  // Two clients start an in-flight search at the same time.
  const searchA = asCancelable(clientA.searchIssues('cancel'));
  const searchB = asCancelable(clientB.searchIssues('types'));

  // Client A cancels mid-flight while Client B remains untouched.
  searchA.cancel();
  log('clientA.searchIssues() canceled mid-flight');

  let clientACanceled = false;
  try {
    await searchA;
    log('clientA: search resolved (unexpected)');
  } catch (error) {
    if (isCancelError(error)) {
      clientACanceled = true;
      log('clientA: caught CancelError via ordinary try/catch');
    } else {
      throw error;
    }
  }

  // Client B's independent call still resolves: isolation holds.
  const issuesB = await searchB;
  const clientBResolved = issuesB.length > 0;
  log(`clientB: search resolved with ${issuesB.length} issue(s) — unaffected by A's cancel`);

  return { lines, clientACanceled, clientBResolved };
}
