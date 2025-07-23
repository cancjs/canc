// Canc main: run scenarios to show lazy-promise cancellation behavior.

import { CancelError } from '@cancjs/promise';
import { lazy } from '@cancjs/lazy-promise';
import { getFlagsCanc } from './flags-canc';

export interface Flags {
 featureAlpha: boolean;
 featureBeta: boolean;
 premiumTier: boolean;
}

async function scenario1LazyStart() {
 console.log('\n=== Scenario 1: Lazy Start (Canc) ===');
 console.log('Calling getFlagsCanc.then() multiple times (no subscription yet)...');
 const p1 = getFlagsCanc.then((f) => f);
 const p2 = getFlagsCanc.then((f) => f);
 console.log('Executor has NOT run yet — cancellation can still skip it.');
 console.log('Now subscribing (await)...');
 const flags = await p1;
 console.log('Executor ran on first subscription.');
 const flags2 = await p2;
 console.log('Second subscriber got same result (executor shared):', flags === flags2);
}

async function scenario2SharedConsumers() {
 console.log('\n=== Scenario 2: Shared Consumers (Canc) ===');
 console.log('Two consumers subscribing to getFlagsCanc simultaneously...');
 const [flags1, flags2] = await Promise.all([
 getFlagsCanc.then((f) => f),
 getFlagsCanc.then((f) => f),
 ]);
 console.log('Both got same result (one executor run):', flags1 === flags2);
 console.log('No cancel yet; both consume successfully.');
}

async function scenario3CancelBeforeStart() {
 console.log('\n=== Scenario 3: Cancel Before Start (Canc) ===');
 console.log('Creating a fresh lazy promise...');
 const fresh = lazy<Flags>((resolve) => {
 setTimeout(() => {
 resolve({ featureAlpha: true, featureBeta: false, premiumTier: true });
 }, 50);
 });
 console.log('Immediately cancel before any subscription...');
 fresh.cancel(new Error('Too early'));
 console.log('Executor never ran.');
 try {
 await fresh;
 } catch (err) {
 console.log('Subscription rejects with CancelError:', err instanceof CancelError ? '(CancelError)' : err);
 }
}

async function scenario4Reset() {
 console.log('\n=== Scenario 4: Reset Cycle (Canc Resettable) ===');
 let callCount = 0;
 const fresh = lazy<Flags>(
 (resolve) => {
 callCount++;
 setTimeout(() => {
 resolve({ featureAlpha: true, featureBeta: false, premiumTier: true });
 }, 100);
 },
 { resettable: true },
 );
 console.log('First subscription triggers executor (call count: ' + callCount + ')...');
 const p1 = fresh.then((f) => f);
 // Cancel before settle (within 100ms timeout)
 setTimeout(() => {
 console.log('Canceling before settle...');
 fresh.cancel(new Error('Resetting'));
 }, 30);
 try {
 await p1;
 } catch (err) {
 console.log('First subscription canceled (CancelError)');
 }
 console.log('Executor call count after reset:', callCount);
 console.log('Second subscription re-triggers executor (resettable reset state)...');
 const p2 = fresh.then((f) => f);
 const flags2 = await p2;
 console.log('Got flags again (re-executed). Executor call count:', callCount);
}

async function main() {
 console.log('Demo: Lazy Promise (Canc)');
 console.log('========================');
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
