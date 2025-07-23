// Stage-3 flavor: native TS 5+ decorators, `experimentalDecorators: false`.
// Import path for a real app: `@cancjs/decorators` (the default entry).
//
// // importing the wrong flavor throws: "...Import from '@cancjs/decorators/legacy' for TS
// // experimentalDecorators, or '@cancjs/decorators/babel-legacy' for babel legacy decorators."
//
// Same IssueClient shape as every other flavor; only the wiring differs. A decorator cannot rewrite
// the declared method type, so the generator methods stay typed as generators (not Promise); the
// class satisfies IssueClientShape structurally at the call sites, not via `implements`.

import { AsyncMethod, BindMethod } from '@cancjs/decorators';
import { await as cancAwait } from '@cancjs/coroutine';
import CancelablePromise from '@cancjs/promise';
import type { CommentAck, Issue, MockApiBundle } from '../issue-types.js';

// Wrap a signal-aware mock-api call as a CancelablePromise so a coroutine cancel() aborts the
// underlying request. Shared by all flavors via copy (kept inline to preserve twin alignment).
function abortable<T>(run: (signal: AbortSignal) => Promise<T>): CancelablePromise<T> {
 return new CancelablePromise<T>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 run(controller.signal).then(resolve, reject);
 });
}

export class IssueClient {
 constructor(private readonly api: MockApiBundle) {}

 // Proto-level (default, bind:false): `this` flows from the call site.
 @AsyncMethod()
 *searchIssues(query: string): Generator<unknown, Issue[]> {
 const issues = yield* cancAwait(abortable((signal) => this.api.issues.list(signal)));
 return issues.filter((issue) => issue.title.toLowerCase().includes(query.toLowerCase()));
 }

 // Per-instance (bind:true): safe to detach and pass as a handler.
 @BindMethod()
 *loadIssue(id: number): Generator<unknown, Issue> {
 const issues = yield* cancAwait(abortable((signal) => this.api.issues.list(signal)));
 const found = issues.find((issue) => issue.id === id);
 if (!found) throw new Error(`no issue ${id}`);
 return found;
 }

 // saveComment reads the issue back and echoes the comment (mock API has no write endpoint).
 @AsyncMethod()
 *saveComment(id: number, comment: string): Generator<unknown, CommentAck> {
 const issue = yield* cancAwait(this.loadIssue(id) as unknown as Promise<Issue>);
 return { issueId: id, comment, issueTitle: issue.title };
 }
}
