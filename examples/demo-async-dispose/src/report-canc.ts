import * as canc from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import type { RagApi } from '@shared/mock-api';

import { Report } from './report-shared';

/**
 * Report generation with async disposal. Built from cancelify wrappers and a canc.async coroutine,
 * so the returned CancelablePromise gets Symbol.asyncDispose for free: await using cancels an
 * unfinished report on scope exit, no manual dispose wiring anywhere in this file.
 */
export function generateReport(ragApi: RagApi, reportId: string): CancelablePromise<Report> & AsyncDisposable {
  const fetchChunks = cancelify(({ getSignal }, id: string) => ragApi.search(id, getSignal()));
  const renderAndUpload = cancelify(({ getSignal }, id: string) => ragApi.search(id, getSignal()));

  const coroutine = canc.async(function* () {
    // fetch data chunks; canceled here, nothing below runs
    const chunks = yield* canc.await(fetchChunks(reportId));
    const report: Report = {
      id: reportId,
      title: 'Report',
      chunkCount: chunks.length,
    };

    // render and upload; canceled here, nothing below runs
    yield* canc.await(renderAndUpload(reportId));

    return report;
  })();

  // shielded audit write always runs to completion even if canceled mid-flight
  const writeAuditLog = () =>
    new CancelablePromise<void>(
      (resolve, reject) => {
        ragApi.search(reportId).then(() => resolve(), reject);
      },
      { shield: true },
    );

  return coroutine.finally(writeAuditLog) as CancelablePromise<Report> & AsyncDisposable;
}
