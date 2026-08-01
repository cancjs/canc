// Shared, flavor-independent glue for the log viewer: how tail lines and search results print, and
// a tiny scripted "user" that clicks two log lines in quick succession. No cancellation logic lives
// here; the twins differ only in how the search stream is wired (see search-{vanilla,canc}.ts).

import { Subject } from 'rxjs';

import { LogLine } from './mock/log-source';

export function renderTail(lines: LogLine[]): void {
  console.log('tail:');
  for (const line of lines) {
    console.log(` #${line.seq} [${line.level}] ${line.message}`);
  }
}

export function renderContext(lineSeq: number, lines: LogLine[]): void {
  console.log(`context for #${lineSeq}:`);
  for (const line of lines) {
    console.log(` #${line.seq} [${line.level}] ${line.message}`);
  }
}

/**
 * Emits two line clicks a few milliseconds apart, then completes. The gap is shorter than the
 * search latency, so the second click lands while the first search is still in flight: exactly the
 * moment where a switch operator must abandon the first search.
 */
export function clickTwoLines(clicks: Subject<number>, gapMs = 10): Promise<void> {
  return new Promise((resolve) => {
    clicks.next(3);
    setTimeout(() => {
      clicks.next(5);
      setTimeout(() => {
        clicks.complete();
        resolve();
      }, gapMs);
    }, gapMs);
  });
}
