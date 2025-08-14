import { CancelablePromise } from '@cancjs/promise';
import { AxiosInstance } from 'axios';
import { Issue, SearchResult } from './issues';
import { cancAxios } from './lib/canc-axios';

/**
 * Cancelable issue client. Request methods return CancelablePromise.
 * Cancel is transparent: call .cancel() on the returned promise to abort the request.
 * When a new search comes in before the old one completes, simply cancel the old promise.
 */
export class CancIssuesClient {
 private cancApi: ReturnType<typeof cancAxios>;
 private latestSearch: CancelablePromise<SearchResult> | null = null;
 private latestDetail: CancelablePromise<Issue> | null = null;

 constructor(instance: AxiosInstance) {
 this.cancApi = cancAxios(instance);
 }

 searchIssues(query: string): CancelablePromise<SearchResult> {
 // Cancel the previous search if it is still pending.
 if (this.latestSearch) {
 this.latestSearch.cancel('superseded by new search');
 }

 // Create a new cancelable search request.
 this.latestSearch = this.cancApi.get<SearchResult>('/issues/search', {
 params: { q: query },
 });

 return this.latestSearch;
 }

 getIssueWithComments(issueId: number): CancelablePromise<Issue> {
 // Cancel the previous detail fetch if it is still pending.
 if (this.latestDetail) {
 this.latestDetail.cancel('new issue selected');
 }

 // Create a new cancelable detail request.
 this.latestDetail = this.cancApi.get<Issue>(`/issues/${issueId}`);

 return this.latestDetail;
 }

 cancelSearch(): void {
 // Direct cancellation: just call cancel() on the promise.
 if (this.latestSearch) {
 this.latestSearch.cancel('user canceled search');
 }
 }

 cancelDetail(): void {
 // Direct cancellation: just call cancel() on the promise.
 if (this.latestDetail) {
 this.latestDetail.cancel('user canceled detail view');
 }
 }
}
