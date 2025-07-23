import { Report } from './report';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * Report generation without async disposal: manual try/finally, every exit point needs cleanup.
 * The finally block must abort the controller before the function returns. If the generator
 * yields control before settled, the abort may fire while rendering or uploading is underway.
 */
export async function generateReport(
 mockApi: MockApiBundle,
 reportId: string
): Promise<Report> {
 const controller = new AbortController();
 try {
 // Fetch data chunks (this is the unabortable part — once started, it runs to completion).
 // keeps running after the user left (wasted work) — every exit needs manual cleanup
 const chunks = await mockApi.rag.search(reportId, controller.signal);
 const report: Report = {
 id: reportId,
 title: 'Report',
 chunkCount: chunks.length,
 };
 // Render and upload (simulate work — these are unabortable in plain promises).
 // result is discarded but work completes anyway
 await mockApi.rag.search(reportId, controller.signal);
 return report;
 } finally {
 // Every early return needs the finally — sync disposal, then async cleanup would need separate wiring.
 controller.abort();
 }
}
