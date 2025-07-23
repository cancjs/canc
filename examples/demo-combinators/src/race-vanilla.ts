// Promise.race: first to settle (win or fail) returns. Remaining keep running.

const settled: string[] = [];

function loadWidget(name: string, delay: number): Promise<string> {
 return new Promise((resolve) => {
 setTimeout(() => {
 settled.push(name);
 resolve(name);
 }, delay);
 });
}

async function runRaceVanilla(): Promise<void> {
 const result = Promise.race([
 loadWidget("sales", 100),
 loadWidget("traffic", 100),
 loadWidget("alerts", 10), // winner
 loadWidget("news", 100)
 ]);

 try {
 const winner = await result;
 console.log(`Vanilla race - winner: ${winner}`);
 } catch {
 // Race completed
 }

 // Wait to see remaining settle (wasted work)
 await new Promise((r) => setTimeout(r, 150));
 console.log(`Vanilla race - all settled: ${settled.length}`);
}

export { runRaceVanilla };
