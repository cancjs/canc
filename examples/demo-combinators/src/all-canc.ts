// CancelablePromise.all: when one widget fails, remaining inputs are canceled.
// Demonstrates two-way cancel propagation (down through losers).

import { CancelablePromise } from "@cancjs/promise";
import { sleep } from "@shared/util";

const completed: string[] = [];
const canceled: string[] = [];

function loadWidget(name: string, delay: number): CancelablePromise<string> {
 return new CancelablePromise((resolve, reject, onCancel) => {
 const timeout = setTimeout(() => {
 if (name === "alerts") {
 reject(new Error("alerts failed"));
 } else {
 completed.push(name);
 resolve(name);
 }
 }, delay);

 onCancel(() => {
 clearTimeout(timeout);
 canceled.push(name);
 reject(new Error(`${name} canceled`));
 });
 });
}

async function runAllCanc(): Promise<void> {
 const results = CancelablePromise.all([
 loadWidget("sales", 50),
 loadWidget("traffic", 50),
 loadWidget("alerts", 10), // fails first
 loadWidget("news", 50)
 ]);

 try {
 await results;
 } catch {
 // canceled here: remaining inputs canceled automatically
 }

 // Wait for cancellations to propagate
 await sleep(100);
 console.log(
 `Canc all - completed: ${completed.length}, canceled: ${canceled.length}`
 );
}

export { runAllCanc };
