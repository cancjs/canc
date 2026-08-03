// TS-legacy flavor: `experimentalDecorators: true`.
// Import path for a real app: `@cancjs/decorators/legacy`.
//
// // importing the wrong flavor throws: "This decorator is for TS legacy decorators
// // ('experimentalDecorators: true') only... Import from '@cancjs/decorators' for stage-3."
//
// Getter style: the getter returns a ready coroutine (`canc.async(fn, this)`); the decorator only
// memoizes it (and binds, for BindMethod). Each coroutine body is a named function with an
// explicit AsyncResult<T> return type, so TypeScript infers the getter's return type without a
// class-internal circular lookup; the class then satisfies IssueClientShape structurally, no cast
// anywhere.

import type { AsyncResult } from '@cancjs/coroutine';
import * as canc from '@cancjs/coroutine';
import { AsyncMethod, BindMethod } from '@cancjs/decorators/legacy';
import CancelablePromise from '@cancjs/promise';

import type { CommentAck, Issue, IssuesApi } from '../issue-types.js';

// Wrap a signal-aware mock-api call as a CancelablePromise so a coroutine cancel() aborts the
// underlying request. Shared by all flavors via copy (kept inline to preserve twin alignment).
function abortable<T>(run: (signal: AbortSignal) => Promise<T>): CancelablePromise<T> {
  return new CancelablePromise<T>((resolve, reject, { handleCancel }) => {
    const controller = new AbortController();
    handleCancel(() => controller.abort());
    run(controller.signal).then(resolve, reject);
  });
}

function* searchIssuesBody(this: IssueClient, query: string): AsyncResult<Issue[]> {
  const issues = yield* canc.await(abortable((signal) => this.issuesApi.list(signal)));
  return issues.filter((issue) => issue.title.toLowerCase().includes(query.toLowerCase()));
}

function* loadIssueBody(this: IssueClient, id: number): AsyncResult<Issue> {
  const issues = yield* canc.await(abortable((signal) => this.issuesApi.list(signal)));
  const found = issues.find((issue) => issue.id === id);
  if (!found) throw new Error(`no issue ${id}`);
  return found;
}

// saveComment reads the issue back and echoes the comment (mock API has no write endpoint).
// loadIssue's declared type is exact (CancelablePromise<Issue>, decorator-preserved), but
// canc.async's own return type is always CancelablePromise<unknown> regardless of the generator
// body's return type, so this one internal call needs a cast; nothing outside this module (the
// class consumers in main.ts, scenario.ts, issue-client.spec.ts) needs one.
function* saveCommentBody(this: IssueClient, id: number, comment: string): AsyncResult<CommentAck> {
  const issue = yield* canc.await(this.loadIssue(id) as Promise<Issue>);
  return { issueId: id, comment, issueTitle: issue.title };
}

export class IssueClient {
  // Not private: the coroutine bodies live outside the class (named functions, for clean type
  // inference on the getters below) and need to read it via `this.issuesApi`.
  constructor(readonly issuesApi: IssuesApi) {}

  // Proto-level (default, bind:false): `, this` binds the coroutine itself, so `this` is safe even
  // detached; the getter runs once and its result is memoized on the instance.
  @AsyncMethod() get searchIssues() {
    return canc.async(searchIssuesBody, this);
  }

  // Per-instance (bind:true): the decorator also binds, so detaching and passing it as a handler
  // is safe even without `, this` on the coroutine.
  @BindMethod() get loadIssue() {
    return canc.async(loadIssueBody, this);
  }

  @AsyncMethod() get saveComment() {
    return canc.async(saveCommentBody, this);
  }
}
