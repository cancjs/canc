// Vanilla main: run scenarios to show memoized-thunk behavior.

import { getFlagsVanilla, resetFlagsCache } from './flags-vanilla';

async function scenario1LazyStart() {
 console.log('\n=== Scenario 1: Lazy Start (Vanilla) ===');
 console.log('Calling getFlagsVanilla() 3 times (but do NOT await)...');
 const p1 = getFlagsVanilla();
 const p2 = getFlagsVanilla();
 const p3 = getFlagsVanilla();
 console.log('All three calls returned instantly (promise already cached or fetching).');
 console.log('Now awaiting all three...');
 const [flags1, flags2, flags3] = await Promise.all([p1, p2, p3]);
 console.log('All resolved to same object reference:', flags1 === flags2 && flags2 === flags3);
}

async function scenario2SharedConsumers() {
 console.log('\n=== Scenario 2: Shared Consumers (Vanilla) ===');
 resetFlagsCache();
 console.log('Reset cache. Two consumers awaiting getFlagsVanilla() simultaneously...');
 const [flags1, flags2] = await Promise.all([getFlagsVanilla(), getFlagsVanilla()]);
 console.log('Both got same result:', flags1 === flags2);
 console.log('Vanilla: no cancel, both consume successfully.');
}

async function scenario3CancelBeforeStart() {
 console.log('\n=== Scenario 3: Cancel Before Start (Vanilla) ===');
 console.log('Vanilla: no lazy mechanism, fetch happens immediately on call.');
 console.log('No way to prevent executor from running.');
 resetFlagsCache();
 const p = getFlagsVanilla();
 const flags = await p;
 console.log('Fetch completed (no cancellation possible).');
}

async function scenario4Reset() {
 console.log('\n=== Scenario 4: Reset Cycle (Vanilla) ===');
 resetFlagsCache();
 console.log('First call fetches...');
 const flags1 = await getFlagsVanilla();
 console.log('Fetched:', flags1);
 console.log('Vanilla: resetFlagsCache() is manual cache-buster.');
 resetFlagsCache();
 console.log('Reset cache manually.');
 console.log('Second call fetches again...');
 const flags2 = await getFlagsVanilla();
 console.log('Fetched again:', flags2);
}

async function main() {
 console.log('Demo: Lazy Promise (Vanilla Baseline)');
 console.log('====================================');
 try {
 await scenario1LazyStart();
 await scenario2SharedConsumers();
 await scenario3CancelBeforeStart();
 await scenario4Reset();
 console.log('\n✓ All scenarios completed');
 } catch (err) {
 console.error('Error:', err);
 }
}

main();
