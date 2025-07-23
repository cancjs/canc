// Promise.any: first to fulfill wins. Remaining losers keep running (native behavior).

const completed: string[] = [];

function loadWidget(name: string, delay: number): Promise<string> {
 return new Promise((resolve, reject) => {
 setTimeout(() => {
 if (name === "news") {
 // First to finish — winner
 resolve(name);
 } else {
 // Losers stay running (wasted work)
 completed.push(name);
 reject(new Error(`${name} rejected`));
 }
 }, delay);
 });
}

async function runAnyVanilla(): Promise<void> {
 const result = Promise.any([
 loadWidget("sales", 100),
 loadWidget("traffic", 100),
 loadWidget("alerts", 100),
 loadWidget("news", 10) // winner
 ]);

 try {
 const winner = await result;
 console.log(`Vanilla any - winner: ${winner}`);
 } catch {
 // AggregateError if all reject
 }

 // Wait to see how many losers still complete
 await new Promise((r) => setTimeout(r, 150));
 console.log(`Vanilla any - losers completed: ${completed.length}`);
}

export { runAnyVanilla };
