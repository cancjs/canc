// CancelablePromise.allSettled: waits all, no loser-cancel by definition.
// Inputs settle independently; no cancellation on first reject (by design).

import { CancelablePromise } from "@cancjs/promise";
import { sleep } from "@shared/util";

const completed: string[] = [];

function loadWidget(name: string, delay: number): CancelablePromise<string> {
 return new CancelablePromise((resolve, reject) => {
 const timeout = setTimeout(() => {
 if (name === "alerts") {
 reject(new Error("alerts failed"));
 } else {
 completed.push(name);
 resolve(name);
 }
 }, delay);

 // (no cancellation handler needed for allSettled semantics)
 });
}

async function runAllSettledCanc(): Promise<void> {
 const results = CancelablePromise.allSettled([
 loadWidget("sales", 50),
 loadWidget("traffic", 50),
 loadWidget("alerts", 10),
 loadWidget("news", 50)
 ]);

 try {
 const settled = await results;
 console.log(`Canc allSettled - fulfilled: ${settled.filter((r) => r.status === "fulfilled").length}`);
 } catch {
 // (allSettled never rejects on input failure)
 }

 await sleep(100);
 console.log(`Canc allSettled - completed: ${completed.length}`);
}

export { runAllSettledCanc };
