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
      // fetch data chunks; stops if controller aborts
      const chunks = await ragApi.search(reportId, controller.signal);
      const report: Report = {
        id: reportId,
        title: 'Report',
        chunkCount: chunks.length,
      };

      // render and upload; stops if controller aborts
      await ragApi.search(reportId, controller.signal);

      return report;
    } finally {
      // audit write is deliberately left unwired so it always runs to completion
      await ragApi.search(reportId);
    }
  })();

  // manual disposal protocol attached directly to promise
  (promise as any)[Symbol.asyncDispose] = async () => {
    controller.abort();
    // catch unhandled rejection when aborted promise is not awaited
    await promise.catch(() => {});
  };

  return promise as Promise<Report> & AsyncDisposable;
}
