import { Subject } from 'rxjs';
import { SearchRecord, tailLines } from './mock/log-source';
import { renderTail, clickTwoLines } from './viewer';
import { contextSearches, render } from './search-vanilla';

async function main(): Promise<void> {
 renderTail(tailLines());

 const clicks = new Subject<number>();
 const searchLog: SearchRecord[] = [];
 contextSearches(clicks, searchLog).subscribe(render);

 console.log('vanilla: clicking #3, then #5 before the first search finishes');
 await clickTwoLines(clicks);

 // Give the abandoned first search time to finish in the background.
 await new Promise((r) => setTimeout(r, 80));

 const completed = searchLog.filter((r) => r.status === 'completed');
 const aborted = searchLog.filter((r) => r.status === 'aborted');
 console.log(`vanilla: search records: ${completed.length} completed, ${aborted.length} aborted`);
 console.log('vanilla: switching away unsubscribed the stream but the promise kept running');
}

main();
