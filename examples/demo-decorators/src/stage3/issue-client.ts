// Stage-3 flavor: native TS 5+ decorators, `experimentalDecorators: false`.
// Import path for a real app: `@cancjs/decorators` (the default entry).
//
// // importing the wrong flavor throws: "...Import from '@cancjs/decorators/legacy' for TS
// // experimentalDecorators, or '@cancjs/decorators/babel-legacy' for babel legacy decorators."
//
// Getter style: the getter returns a ready coroutine (`cancAsync(fn, this)`); the decorator only
// memoizes it (and binds, for BindMethod). Each coroutine body is a named function with an explicit
// AsyncResult<T> return type, so TypeScript infers the getter's return type without a class-internal
// circular lookup; the class then satisfies IssueClientShape structurally, no cast anywhere.

import { AsyncMethod, BindMethod } from '@cancjs/decorators';
import { async as cancAsync, await as cancAwait, AsyncResult } from '@cancjs/coroutine';
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

function* searchIssuesBody(this: IssueClient, query: string): AsyncResult<Issue[]> {
 const issues = yield* cancAwait(abortable((signal) => this.api.issues.list(signal)));
 return issues.filter((issue) => issue.title.toLowerCase().includes(query.toLowerCase()));
}

function* loadIssueBody(this: IssueClient, id: number): AsyncResult<Issue> {
 const issues = yield* cancAwait(abortable((signal) => this.api.issues.list(signal)));
 const found = issues.find((issue) => issue.id === id);
 if (!found) throw new Error(`no issue ${id}`);
 return found;
}

// saveComment reads the issue back and echoes the comment (mock API has no write endpoint). A
// decorated accessor's type, seen from outside its own getter body, does not carry the getter's
// inferred return type, so this one internal call needs a type argument; nothing outside this
// module (the class consumers in main.ts, scenario.ts, issue-client.spec.ts) needs a cast.
function* saveCommentBody(this: IssueClient, id: number, comment: string): AsyncResult<CommentAck> {
 const issue = yield* cancAwait(this.loadIssue(id) as Promise<Issue>);
 return { issueId: id, comment, issueTitle: issue.title };
}

export class IssueClient {
 // Not private: the coroutine bodies live outside the class (named functions, for clean type
 // inference on the getters below) and need to read it via `this.api`.
 constructor(readonly api: MockApiBundle) {}

 // Proto-level (default, bind:false): `, this` binds the coroutine itself, so `this` is safe even
 // detached; the getter runs once and its result is memoized on the instance.
 @AsyncMethod() get searchIssues() {
 return cancAsync(searchIssuesBody, this);
 }

 // Per-instance (bind:true): the decorator also binds, so detaching and passing it as a handler
 // is safe even without `, this` on the coroutine.
 @BindMethod() get loadIssue() {
 return cancAsync(loadIssueBody, this);
 }

 @AsyncMethod() get saveComment() {
 return cancAsync(saveCommentBody, this);
 }
}
