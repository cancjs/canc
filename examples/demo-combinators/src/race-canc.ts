// CancelablePromise.race: first to settle wins, rest canceled.
// Demonstrates cancel of losers on any settlement.

import { CancelablePromise } from "@cancjs/promise";

const settled: string[] = [];
const canceled: string[] = [];

function loadWidget(name: string, delay: number): CancelablePromise<string> {
 return new CancelablePromise((resolve, onCancel) => {
 const timeout = setTimeout(() => {
 settled.push(name);
 resolve(name);
 }, delay);

 onCancel(() => {
 clearTimeout(timeout);
 canceled.push(name);
 });
 });
}

async function runRaceCanc(): Promise<void> {
 const result = CancelablePromise.race([
 loadWidget("sales", 100),
 loadWidget("traffic", 100),
 loadWidget("alerts", 10), // winner
 loadWidget("news", 100)
 ]);

 try {
 const winner = await result;
 console.log(`Canc race - winner: ${winner}`);
 } catch {
 // Race completed
 }

 // canceled here — losers canceled
 await new Promise((r) => setTimeout(r, 150));
 console.log(`Canc race - canceled: ${canceled.length}`);
}

export { runRaceCanc };
