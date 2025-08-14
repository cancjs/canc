// Babel-legacy flavor: `@babel/plugin-proposal-decorators` with `legacy: true`.
// Written as .js because it needs babel's legacy decorator transform to run (see babel.config.cjs).
// Import path for a real app: `@cancjs/decorators/babel-legacy`.
//
// // importing the wrong flavor throws: "This decorator is for babel legacy decorators only...
// // Import from '@cancjs/decorators' for stage-3 decorators."
//
// This file is plain JS, so a method decorator returning a coroutine directly is fine here: there
// is no static type to preserve or lose. The other flavors are TypeScript, where a method decorator
// cannot retype the declared method, so they use the getter style instead (see stage3/ts-legacy).

import { AsyncMethod, BindMethod } from '@cancjs/decorators/babel-legacy';
import { await as cancAwait } from '@cancjs/coroutine';
import CancelablePromise from '@cancjs/promise';

// Wrap a signal-aware mock-api call as a CancelablePromise so a coroutine cancel() aborts the
// underlying request. Shared by all flavors via copy (kept inline to preserve twin alignment).
function abortable(run) {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 run(controller.signal).then(resolve, reject);
 });
}

export class IssueClient {
 constructor(issuesApi) {
 this.issuesApi = issuesApi;
 }

 // Proto-level (default, bind:false): `this` flows from the call site.
 @AsyncMethod()
 *searchIssues(query) {
 const issues = yield* cancAwait(abortable((signal) => this.issuesApi.list(signal)));
 return issues.filter((issue) => issue.title.toLowerCase().includes(query.toLowerCase()));
 }

 // Per-instance (bind:true): safe to detach and pass as a handler.
 @BindMethod()
 *loadIssue(id) {
 const issues = yield* cancAwait(abortable((signal) => this.issuesApi.list(signal)));
 const found = issues.find((issue) => issue.id === id);
 if (!found) throw new Error(`no issue ${id}`);
 return found;
 }

 // saveComment reads the issue back and echoes the comment (mock API has no write endpoint).
 @AsyncMethod()
 *saveComment(id, comment) {
 const issue = yield* cancAwait(this.loadIssue(id));
 return { issueId: id, comment, issueTitle: issue.title };
 }
}
