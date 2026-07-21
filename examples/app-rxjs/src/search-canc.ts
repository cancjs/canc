// canc flavor: a line click triggers a context search, and a new click should replace the old one.
// switchMap unsubscribes the previous inner Observable, and here the inner Observable is
// fromCancelablePromise(factory) around a CancelablePromise. Unsubscribing runs the promise's cancel(),
// which aborts the underlying search. The boundary that leaked in the vanilla twin is now closed:
// the search actually stops. The search records prove it (one `aborted`, one `completed`).

import { Observable, Subject, switchMap } from 'rxjs';
import { cancelify } from '@cancjs/toolbox';
import { LogLine, SearchRecord, searchContext } from './mock/log-source';
import { fromCancelablePromise } from './lib/canc-rxjs';
import { renderContext } from './viewer';

/**
 * Wire line clicks to context searches. Each click switch-maps to a fresh search; switchMap drops
 * the previous inner Observable when a new click arrives.
 */
export function contextSearches(clicks: Subject<number>, log: SearchRecord[]): Observable<[number, LogLine[]]> {
 return clicks.pipe(
 switchMap((lineSeq) => {
 // fromCancelablePromise(factory): switching away unsubscribes this Observable, and unsubscribe
 // cancels the promise — the previous search is aborted, not left running (no wasted work).
 const search = () =>
 cancelify(({ getSignal }) => searchContext(lineSeq, log, getSignal()))();
 return fromCancelablePromise(search).pipe(mapWithSeq(lineSeq));
 })
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
 })
 );
}

export function render([lineSeq, lines]: [number, LogLine[]]): void {
 renderContext(lineSeq, lines);
}
