// canc flavor: a line click triggers a context search, and a new click should replace the old one.
// switchMap unsubscribes the previous inner Observable, and here the inner Observable is
// fromCancelable(factory) around a CancelablePromise. Unsubscribing runs the promise's cancel(),
// which aborts the underlying search. The boundary that leaked in the vanilla twin is now closed:
// the search actually stops. The search records prove it (one `aborted`, one `completed`).

import { Observable, Subject, switchMap } from 'rxjs';
import CancelablePromise from '@cancjs/promise';
import { LogLine, SearchRecord, searchContext } from './mock/log-source';
import { fromCancelable } from './lib/canc-rxjs';
import { renderContext } from './viewer';

/**
 * Wire line clicks to context searches. Each click switch-maps to a fresh search; switchMap drops
 * the previous inner Observable when a new click arrives.
 */
export function contextSearches(clicks: Subject<number>, log: SearchRecord[]): Observable<[number, LogLine[]]> {
 return clicks.pipe(
 switchMap((lineSeq) => {
 // fromCancelable(factory): switching away unsubscribes this Observable, and unsubscribe
 // cancels the promise — the previous search is aborted, not left running (no wasted work).
 const search = () => cancelableSearch(lineSeq, log);
 return fromCancelable(search).pipe(mapWithSeq(lineSeq));
 })
 );
}

// Builds one cancelable search whose cancel() aborts the underlying signal-aware call.
function cancelableSearch(lineSeq: number, log: SearchRecord[]): CancelablePromise<LogLine[]> {
 return new CancelablePromise<LogLine[]>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 searchContext(lineSeq, log, controller.signal).then(resolve, reject);
 });
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
