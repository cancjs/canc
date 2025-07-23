import { runAllCanc } from "./all-canc";
import { runAnyCanc } from "./any-canc";
import { runRaceCanc } from "./race-canc";
import { runAllSettledCanc } from "./all-settled-canc";
import { runIsolationCanc } from "./isolation-canc";

async function main(): Promise<void> {
 console.log("=== CancelablePromise Combinators ===\n");

 console.log("--- all() with cancel loser ---");
 await runAllCanc();

 console.log("\n--- any() with cancel loser ---");
 await runAnyCanc();

 console.log("\n--- race() with cancel loser ---");
 await runRaceCanc();

 console.log("\n--- allSettled() (no loser cancel) ---");
 await runAllSettledCanc();

 console.log("\n--- isolation (bubble:false) ---");
 await runIsolationCanc();
}

main().catch(console.error);
