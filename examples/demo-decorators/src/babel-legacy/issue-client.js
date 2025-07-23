// Babel-legacy flavor: `@babel/plugin-proposal-decorators` with `legacy: true`.
// Written as .js because it needs babel's legacy decorator transform to run (see babel.config.cjs).
// Import path for a real app: `@cancjs/decorators/babel-legacy`.
//
// // importing the wrong flavor throws: "This decorator is for babel legacy decorators only...
// // Import from '@cancjs/decorators' for stage-3 decorators."
//
// Same IssueClient shape as every other flavor; only the wiring differs.

import { BabelLegacyAsyncMethod, BabelLegacyBindMethod } from '@cancjs/decorators';
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
 constructor(api) {
 this.api = api;
 }

 // Proto-level (default, bind:false): `this` flows from the call site.
 @BabelLegacyAsyncMethod()
 *searchIssues(query) {
 const issues = yield* cancAwait(abortable((signal) => this.api.issues.list(signal)));
 return issues.filter((issue) => issue.title.toLowerCase().includes(query.toLowerCase()));
 }

 // Per-instance (bind:true): safe to detach and pass as a handler.
 @BabelLegacyBindMethod()
 *loadIssue(id) {
 const issues = yield* cancAwait(abortable((signal) => this.api.issues.list(signal)));
 const found = issues.find((issue) => issue.id === id);
 if (!found) throw new Error(`no issue ${id}`);
 return found;
 }

 // saveComment reads the issue back and echoes the comment (mock API has no write endpoint).
 @BabelLegacyAsyncMethod()
 *saveComment(id, comment) {
 const issue = yield* cancAwait(this.loadIssue(id));
 return { issueId: id, comment, issueTitle: issue.title };
 }
}
