import CancelablePromise from '@cancjs/promise';
import { Report } from './report';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * Disposable report generator using async disposal: an AsyncDisposable returning a CancelablePromise.
 * Leaving the scope (return/throw/early-exit) auto-cancels an unfinished report; await using waits
 * for cleanup handlers to settle before continuing.
 */
export function generateReport(
 mockApi: MockApiBundle,
 reportId: string
): CancelablePromise<Report> & AsyncDisposable {
 let cancelled = false;

 const promise = new CancelablePromise<Report>(async (resolve, reject, handleCancel) => {
 const controller = new AbortController();

 handleCancel(() => {
 cancelled = true;
 controller.abort();
 });

 try {
 // Fetch data chunks — the underlying call stops if canceled.
 // canceled here — nothing below runs
 const chunks = await mockApi.rag.search(reportId, controller.signal);
 const report: Report = {
 id: reportId,
 title: 'Report',
 chunkCount: chunks.length,
 };
 // Render and upload (simulate — these also stop if canceled).
 // canceled here — nothing below runs
 await mockApi.rag.search(reportId, controller.signal);
 resolve(report);
 } catch (error) {
 reject(error);
 }
 });

 // Attach the async disposal protocol: leaving the scope calls [Symbol.asyncDispose].
 (promise as any)[Symbol.asyncDispose] = async function () {
 if (!cancelled) {
 await promise.cancel();
 }
 };

 return promise as any;
}
