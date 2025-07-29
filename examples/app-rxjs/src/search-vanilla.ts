// Vanilla flavor: a line click triggers a context search, and a new click should replace the old
// one. switchMap unsubscribes the previous inner Observable, but here the inner Observable is
// `from(promise)` wrapping a plain promise. Unsubscribing from(promise) stops the emission but
// CANNOT stop the promise: the search keeps running to completion in the background. This is the
// classic RxJS + async boundary leak. The search records prove it (two `completed` markers).

import { Observable, Subject, from, switchMap } from 'rxjs';
import { LogLine, SearchRecord, searchContext } from './mock/log-source';
import { renderContext } from './viewer';

/**
 * Wire line clicks to context searches. Each click switch-maps to a fresh search; switchMap drops
 * the previous inner Observable when a new click arrives.
 */
export function contextSearches(clicks: Subject<number>, log: SearchRecord[]): Observable<[number, LogLine[]]> {
 return clicks.pipe(
 switchMap((lineSeq) => {
 // from(promise): switching away unsubscribes this Observable, but the promise it wraps keeps
 // running — the previous search completes anyway (wasted work, stale result discarded).
 const search = searchContext(lineSeq, log);
 return from(search).pipe(mapWithSeq(lineSeq));
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
