// Babel-legacy flavor: `@babel/plugin-proposal-decorators` with `legacy: true`.
// Written as .js because it needs babel's legacy decorator transform to run (see babel.config.cjs).
// Import path for a real app: `@cancjs/decorators/babel-legacy`.
//
// // importing the wrong flavor throws: "This decorator is for babel legacy decorators only...
// // Import from '@cancjs/decorators' for stage-3 decorators."
//
// Plain JS permits decorators to return coroutines directly without static types to preserve.

import * as canc from '@cancjs/coroutine';
import { AsyncMethod, BindMethod } from '@cancjs/decorators/babel-legacy';

import { listIssues } from '../util/api-wrapper.js';

export class IssueClient {
  constructor(issuesApi) {
    this.issuesApi = issuesApi;
  }

  // Proto-level (default, bind:false): `this` flows from the call site.
  @AsyncMethod()
  *searchIssues(query) {
    const issues = yield* canc.await(listIssues(this.issuesApi));
    return issues.filter((issue) => issue.title.toLowerCase().includes(query.toLowerCase()));
  }

  // Per-instance (bind:true): safe to detach and pass as a handler.
  @BindMethod()
  *loadIssue(id) {
    const issues = yield* canc.await(listIssues(this.issuesApi));
    const found = issues.find((issue) => issue.id === id);
    if (!found) throw new Error(`no issue ${id}`);
    return found;
  }

  // saveComment reads the issue back and echoes the comment (mock API has no write endpoint).
  @AsyncMethod()
  *saveComment(id, comment) {
    const issue = yield* canc.await(this.loadIssue(id));
    return { issueId: id, comment, issueTitle: issue.title };
  }
}
