// CancelablePromise.any: first to fulfill wins, loser inputs canceled.
// Demonstrates cancel propagation (down to losers on first win).

import { CancelablePromise } from "@cancjs/promise";
import { sleep } from "@shared/util";

const completed: string[] = [];
const canceled: string[] = [];

function loadWidget(name: string, delay: number): CancelablePromise<string> {
 return new CancelablePromise((resolve, reject, onCancel) => {
 const timeout = setTimeout(() => {
 if (name === "news") {
 resolve(name);
 } else {
 completed.push(name);
 reject(new Error(`${name} rejected`));
 }
 }, delay);

 onCancel(() => {
 clearTimeout(timeout);
 canceled.push(name);
 reject(new Error(`${name} canceled`));
 });
 });
}

async function runAnyCanc(): Promise<void> {
 const result = CancelablePromise.any([
 loadWidget("sales", 100),
 loadWidget("traffic", 100),
 loadWidget("alerts", 100),
 loadWidget("news", 10) // winner
 ]);

 try {
 const winner = await result;
 console.log(`Canc any - winner: ${winner}`);
 } catch {
 // canceled here: loser inputs canceled
 }

 // Wait for cancellations
 await sleep(150);
 console.log(
 `Canc any - canceled: ${canceled.length}`
 );
}

export { runAnyCanc };
