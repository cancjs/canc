import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import type { RagApi } from '@shared/mock-api';

import { Report } from './report-shared';

/**
 * Report generation with async disposal. Built from cancelify wrappers and a cancAsync coroutine,
 * so the returned CancelablePromise gets Symbol.asyncDispose for free: await using cancels an
 * unfinished report on scope exit, no manual dispose wiring anywhere in this file.
 */
export function generateReport(ragApi: RagApi, reportId: string): CancelablePromise<Report> & AsyncDisposable {
  const fetchChunks = cancelify(({ getSignal }, [id]: [string]) => ragApi.search(id, getSignal()));
  const renderAndUpload = cancelify(({ getSignal }, [id]: [string]) => ragApi.search(id, getSignal()));

  const coroutine = cancAsync(function* () {
    // Fetch data chunks. Canceled here, nothing below runs.
    const chunks = yield* cancAwait(fetchChunks(reportId));
    const report: Report = {
      id: reportId,
      title: 'Report',
      chunkCount: chunks.length,
    };

    // Render and upload (simulated). Still canceled here, nothing below runs.
    yield* cancAwait(renderAndUpload(reportId));

    return report;
  })();

  // Audit write is shielded: it always runs to completion, even when the steps above were
  // canceled mid-flight. Built as its own shielded node, constructed only when cleanup actually
  // starts (not eagerly), and attached with .finally() rather than yielded inside the coroutine's
  // own try/finally, so the shield does not depend on the coroutine's cancel reaching an
  // in-flight step at the same moment its own cleanup step settles. A hand-rolled AbortController
  // equivalent needs a second, deliberately unwired controller to get the same guarantee (see
  // report-vanilla.ts).
  const writeAuditLog = () =>
    new CancelablePromise<void>(
      (resolve, reject) => {
        ragApi.search(reportId).then(() => resolve(), reject);
      },
      { shield: true },
    );

  return coroutine.finally(writeAuditLog) as CancelablePromise<Report> & AsyncDisposable;
}
