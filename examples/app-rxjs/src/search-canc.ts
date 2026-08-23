// canc flavor: switchMap with fromCancelablePromise aborts in-flight search on new click

import { cancelify } from '@cancjs/toolbox';
import { Observable, Subject, switchMap } from 'rxjs';

import { fromCancelablePromise } from './lib/canc-rxjs';
import { LogLine, searchContext, SearchRecord } from './mock/log-source';
import { renderContext } from './viewer';

/**
 * Wire line clicks to context searches. Each click switch-maps to a fresh search; switchMap drops
 * the previous inner Observable when a new click arrives.
 */
export function contextSearches(clicks: Subject<number>, log: SearchRecord[]): Observable<[number, LogLine[]]> {
  return clicks.pipe(
    switchMap((lineSeq) => {
      // switching away unsubscribes Observable, canceling the underlying search promise
      const search = () => cancelify(({ getSignal }) => searchContext(lineSeq, log, getSignal()))();
      return fromCancelablePromise(search).pipe(mapWithSeq(lineSeq));
    }),
  );
}

// Pairs each result with the line it belongs to, so the renderer can label it.
function mapWithSeq(lineSeq: number) {
  return (source: Observable<LogLine[]>): Observable<[number, LogLine[]]> =>
    new Observable<[number, LogLine[]]>((subscriber) =>
      source.subscribe({
        next: (lines) => subscriber.next([lineSeq, lines]),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      }),
    );
}

export function render([lineSeq, lines]: [number, LogLine[]]): void {
  renderContext(lineSeq, lines);
}
