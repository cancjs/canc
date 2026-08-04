import cancelableAxios, { ICancelableAxiosInstance } from '@cancjs/axios';
import { CancelablePromise } from '@cancjs/promise';
import { AxiosInstance } from 'axios';

import { Issue, SearchResult } from './issues';

/**
 * Cancelable issue client. Request methods return CancelablePromise.
 * Cancel is transparent: call .cancel() on the returned promise to abort the request.
 * When a new search comes in before the old one completes, simply cancel the old promise.
 */
export class CancIssuesClient {
  private api: ICancelableAxiosInstance;
  private latestSearch: CancelablePromise<SearchResult> | null = null;
  private latestDetail: CancelablePromise<Issue> | null = null;

  constructor(instance: AxiosInstance) {
    this.api = cancelableAxios.wrap(instance);
  }

  searchIssues(query: string): CancelablePromise<SearchResult> {
    // Cancel the previous search if it is still pending.
    if (this.latestSearch) {
      this.latestSearch.cancel('superseded by new search');
    }

    // Create a new cancelable search request.
    // The wrapper keeps the axios signature, so the response is unwrapped here.
    const searchPromise = this.api
      .get<SearchResult>('/issues/search', { params: { q: query } })
      .then((response) => response.data);

    this.latestSearch = searchPromise;
    return searchPromise;
  }

  getIssueWithComments(issueId: number): CancelablePromise<Issue> {
    // Cancel the previous detail fetch if it is still pending.
    if (this.latestDetail) {
      this.latestDetail.cancel('new issue selected');
    }

    // Create a new cancelable detail request.
    const detailPromise = this.api.get<Issue>(`/issues/${issueId}`).then((response) => response.data);

    this.latestDetail = detailPromise;
    return detailPromise;
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
