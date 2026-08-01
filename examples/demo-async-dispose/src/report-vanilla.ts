import type { RagApi } from '@shared/mock-api';

import { Report } from './report-shared';

/**
 * Report generation without async disposal: manual try/finally, AbortController threaded by hand,
 * and a manually attached Symbol.asyncDispose so await using still works. Every exit point needs
 * this wiring; CancelablePromise gets it for free (see report-canc.ts).
 */
export function generateReport(ragApi: RagApi, reportId: string): Promise<Report> & AsyncDisposable {
  const controller = new AbortController();

  const promise = (async (): Promise<Report> => {
    try {
      // Fetch data chunks. The underlying call stops if the controller aborts.
      // canceled here: nothing below runs
      const chunks = await ragApi.search(reportId, controller.signal);
      const report: Report = {
        id: reportId,
        title: 'Report',
        chunkCount: chunks.length,
      };

      // Render and upload (simulated). Still stops if the controller aborts.
      // canceled here: nothing below runs
      await ragApi.search(reportId, controller.signal);

      return report;
    } finally {
      // The audit write is never given the controller's signal, on purpose, so it always runs to
      // completion. That guarantee lives in remembering to leave this one call unwired rather than
      // in an explicit option (compare the shielded yield in report-canc.ts).
      await ragApi.search(reportId);
    }
  })();

  // Manual disposal protocol: nothing calls this unless we attach it ourselves.
  (promise as any)[Symbol.asyncDispose] = async () => {
    controller.abort();
    // A plain promise has no built-in way to mark its own rejection handled, so an aborted
    // promise nobody else awaits becomes an unhandled rejection and crashes the process.
    // We have to remember this catch on every dispose path; CancelablePromise does it for free.
    await promise.catch(() => {});
  };

  return promise as Promise<Report> & AsyncDisposable;
}
