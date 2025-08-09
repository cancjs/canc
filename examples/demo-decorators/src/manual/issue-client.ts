// Manual flavor: no decorators at all. Constructor wiring with cancAsync(this.method, this) is the
// exact desugaring the getter-style decorators apply (@AsyncMethod/@BindMethod on a getter memoize
// a coroutine you hand it yourself; this does the same assignment by hand, once, in the constructor).
// Works under any toolchain (no transform required), so it doubles as the no-decorator baseline twin
// for this demo.
//
// This is the -vanilla counterpart in spirit, but a plain-promise vanilla twin teaches nothing new
// here (the lesson is decorator wiring vs manual wiring, not cancelable vs uncancelable), so the
// demo skips the -vanilla suffix pair and uses this manual flavor as the baseline instead.

import { async as cancAsync, await as cancAwait } from '@cancjs/coroutine';
import CancelablePromise from '@cancjs/promise';
import type { CommentAck, Issue, IssueClientShape, MockApiBundle } from '../issue-types.js';

// Wrap a signal-aware mock-api call as a CancelablePromise so a coroutine cancel() aborts the
// underlying request. Shared by all flavors via copy (kept inline to preserve twin alignment).
function abortable<T>(run: (signal: AbortSignal) => Promise<T>): CancelablePromise<T> {
 return new CancelablePromise<T>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 run(controller.signal).then(resolve, reject);
 });
}

export class IssueClient implements IssueClientShape {
 constructor(private readonly api: MockApiBundle) {
 // Equivalent to @AsyncMethod() / @BindMethod({ bind: true }): assign each coroutine, bound to
 // this instance, once. loadIssue is bound (detachable handler). cancAsync's own return typing
 // does not narrow past the generator's yield type here, so the field types above are the
 // source of truth; the cast just restates them at the assignment.
 this.searchIssues = cancAsync(this.searchIssuesGen, this) as unknown as IssueClient['searchIssues'];
 this.loadIssue = cancAsync(this.loadIssueGen, this) as unknown as IssueClient['loadIssue'];
 this.saveComment = cancAsync(this.saveCommentGen, this) as unknown as IssueClient['saveComment'];
 }

 searchIssues!: (query: string) => Promise<Issue[]>;
 loadIssue!: (id: number) => Promise<Issue>;
 saveComment!: (id: number, comment: string) => Promise<CommentAck>;

 private *searchIssuesGen(query: string): Generator<unknown, Issue[]> {
 const issues = yield* cancAwait(abortable((signal) => this.api.issues.list(signal)));
 return issues.filter((issue) => issue.title.toLowerCase().includes(query.toLowerCase()));
 }

 private *loadIssueGen(id: number): Generator<unknown, Issue> {
 const issues = yield* cancAwait(abortable((signal) => this.api.issues.list(signal)));
 const found = issues.find((issue) => issue.id === id);
 if (!found) throw new Error(`no issue ${id}`);
 return found;
 }

 private *saveCommentGen(id: number, comment: string): Generator<unknown, CommentAck> {
 const issue = yield* cancAwait(this.loadIssue(id));
 return { issueId: id, comment, issueTitle: issue.title };
 }
}
