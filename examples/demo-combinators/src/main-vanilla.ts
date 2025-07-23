import { runAllVanilla } from "./all-vanilla";
import { runAnyVanilla } from "./any-vanilla";
import { runRaceVanilla } from "./race-vanilla";
import { runAllSettledVanilla } from "./all-settled-vanilla";
import { runIsolationVanilla } from "./isolation-vanilla";

async function main(): Promise<void> {
 console.log("=== Promise (vanilla) Combinators ===\n");

 console.log("--- all() ---");
 await runAllVanilla();

 console.log("\n--- any() ---");
 await runAnyVanilla();

 console.log("\n--- race() ---");
 await runRaceVanilla();

 console.log("\n--- allSettled() ---");
 await runAllSettledVanilla();

 console.log("\n--- isolation (manual flag) ---");
 await runIsolationVanilla();
}

main().catch(console.error);
