// Promise.all: native behavior keeps remaining widgets running after one fails.
// All promises settle independently (wasted work on canceled request).

const completed: string[] = [];

function loadWidget(name: string, delay: number): Promise<string> {
 return new Promise((resolve, reject) => {
 setTimeout(() => {
 if (name === "alerts") {
 // One widget fails
 reject(new Error("alerts failed"));
 } else {
 // Others complete normally (keeps running even after one fails)
 completed.push(name);
 resolve(name);
 }
 }, delay);
 });
}

async function runAllVanilla(): Promise<void> {
 const results = Promise.all([
 loadWidget("sales", 50),
 loadWidget("traffic", 50),
 loadWidget("alerts", 10), // fails first
 loadWidget("news", 50)
 ]);

 try {
 await results;
 } catch {
 // One rejected, but native Promise.all does not cancel remaining
 // Completed count shows how many finished (wasted work)
 }

 // Wait for all to settle
 await new Promise((r) => setTimeout(r, 100));
 console.log(`Vanilla all - completed: ${completed.length}`);
}

export { runAllVanilla };
