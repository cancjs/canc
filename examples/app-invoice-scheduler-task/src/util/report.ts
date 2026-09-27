/** Demo-only counters. Prefixed so a reader can tell instrumentation from business logic at a glance. */
export interface IReportCounters {
  reportRowsRendered: number;
  reportPrefetchesStarted: number;
  reportPrefetchesCanceled: number;
  reportRetries: number;
}

export function createReportCounters(): IReportCounters {
  return {
    reportRowsRendered: 0,
    reportPrefetchesStarted: 0,
    reportPrefetchesCanceled: 0,
    reportRetries: 0,
  };
}

/** Writes the counters into the report panel as one plain-words line. */
export function renderReportCounters(root: HTMLElement, counters: IReportCounters): void {
  root.textContent =
    `rows rendered: ${counters.reportRowsRendered}, ` +
    `prefetches started: ${counters.reportPrefetchesStarted}, ` +
    `prefetches canceled: ${counters.reportPrefetchesCanceled}, ` +
    `retries: ${counters.reportRetries}`;
}
