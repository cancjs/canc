// Promise.allSettled: waits for all to settle (never rejects on individual failures).
// Native behavior: no cancel, all complete.

import { sleep } from "@shared/util";

const completed: string[] = [];

function loadWidget(name: string, delay: number): Promise<string> {
 return new Promise((resolve, reject) => {
 setTimeout(() => {
 if (name === "alerts") {
 reject(new Error("alerts failed"));
 } else {
 completed.push(name);
 resolve(name);
 }
 }, delay);
 });
}

async function runAllSettledVanilla(): Promise<void> {
 const results = Promise.allSettled([
 loadWidget("sales", 50),
 loadWidget("traffic", 50),
 loadWidget("alerts", 10), // rejects
 loadWidget("news", 50)
 ]);

 try {
 const settled = await results;
 console.log(`Vanilla allSettled - fulfilled: ${settled.filter((r) => r.status === "fulfilled").length}`);
 } catch {
 // (no cancel)
 }

 await sleep(100);
 console.log(`Vanilla allSettled - completed: ${completed.length}`);
}

export { runAllSettledVanilla };
