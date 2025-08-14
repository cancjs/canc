import axios, { AxiosInstance } from 'axios';
import { Issue, SearchResult } from './issues';

/**
 * Vanilla issue client using axios with a registry pattern for cancellation.
 * Every request gets a unique ID; AbortController manages cleanup on settle.
 * When a new search comes in before the old one completes, the old request is
 * still tracked and its resources must be cleaned up manually.
 */
export class VanillaIssuesClient {
 private requestRegistry = new Map<string, AbortController>();
 private latestSearchId: string | null = null;

 constructor(private instance: AxiosInstance) {}

 async searchIssues(query: string): Promise<SearchResult> {
 const searchId = `search_${Date.now()}_${Math.random()}`;
 const ac = new AbortController();
 this.requestRegistry.set(searchId, ac);

 try {
 const response = await this.instance.get<SearchResult>('/issues/search', {
 params: { q: query },
 signal: ac.signal,
 });

 // If this is not the latest search, the result is discarded but the request completed anyway.
 if (this.latestSearchId !== searchId) {
 return { issues: [], query };
 }

 return response.data;
 } catch (err: unknown) {
 // Manually check for abort/cancel and treat it as a known cancellation.
 if (axios.isCancel(err) || (err instanceof Error && err.name === 'AbortError')) {
 return { issues: [], query };
 }
 throw err;
 } finally {
 // Manual cleanup: the controller is no longer needed.
 this.requestRegistry.delete(searchId);
 }
 }

 async getIssueWithComments(issueId: number): Promise<Issue> {
 const ac = new AbortController();
 const detailId = `detail_${issueId}`;
 this.requestRegistry.set(detailId, ac);

 try {
 const response = await this.instance.get<Issue>(`/issues/${issueId}`, {
 signal: ac.signal,
 });
 return response.data;
 } finally {
 this.requestRegistry.delete(detailId);
 }
 }

 cancelSearch(): void {
 // To cancel the current search, we must track which ID was the latest and abort it.
 // This is manual bookkeeping — registry contains ALL in-flight requests; we abort only the latest.
 if (this.latestSearchId && this.requestRegistry.has(this.latestSearchId)) {
 const ac = this.requestRegistry.get(this.latestSearchId);
 ac?.abort();
 }
 }

 cancelDetail(issueId: number): void {
 // To cancel a detail fetch, find its controller in the registry and abort.
 const detailId = `detail_${issueId}`;
 if (this.requestRegistry.has(detailId)) {
 const ac = this.requestRegistry.get(detailId);
 ac?.abort();
 }
 }
}
