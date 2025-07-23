// Without cancellation support, isolation requires manual flag tracking.
// When one widget fails, dependent widgets must manually check _isCanceled.

const completed: string[] = [];
let isCanceled = false;

function loadWidget(name: string, delay: number): Promise<string> {
 return new Promise((resolve, reject) => {
 setTimeout(() => {
 if (isCanceled) {
 // manual isolation (wasted work checking flag)
 reject(new Error(`${name} isolated`));
 return;
 }

 if (name === "alerts") {
 isCanceled = true;
 reject(new Error("alerts failed"));
 } else {
 completed.push(name);
 resolve(name);
 }
 }, delay);
 });
}

async function runIsolationVanilla(): Promise<void> {
 const results = Promise.all([
 loadWidget("sales", 50),
 loadWidget("traffic", 50),
 loadWidget("alerts", 10),
 loadWidget("news", 50)
 ]);

 try {
 await results;
 } catch {
 // keeps running (isolation not automatic)
 }

 await new Promise((r) => setTimeout(r, 100));
 console.log(`Vanilla isolation - completed: ${completed.length}`);
}

export { runIsolationVanilla };
