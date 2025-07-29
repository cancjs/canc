import { Subject } from 'rxjs';
import { SearchRecord, tailLines } from './mock/log-source';
import { renderTail, clickTwoLines } from './viewer';
import { contextSearches, render } from './search-canc';

async function main(): Promise<void> {
 renderTail(tailLines());

 const clicks = new Subject<number>();
 const searchLog: SearchRecord[] = [];
 contextSearches(clicks, searchLog).subscribe(render);

 console.log('canc: clicking #3, then #5 before the first search finishes');
 await clickTwoLines(clicks);

 // Nothing left running in the background — the abandoned first search was canceled.
 await new Promise((r) => setTimeout(r, 80));

 const completed = searchLog.filter((r) => r.status === 'completed');
 const aborted = searchLog.filter((r) => r.status === 'aborted');
 console.log(`canc: search records: ${completed.length} completed, ${aborted.length} aborted`);
 console.log('canc: switching away unsubscribed the stream and cancel() aborted the search');
}

main();
