// Lazy approach: executor runs on first subscription, shared across N consumers, cancellable.

import { lazy } from '@cancjs/lazy-promise';

export interface Flags {
 featureAlpha: boolean;
 featureBeta: boolean;
 premiumTier: boolean;
}

// Lazy promise: executes ONLY on first `await`/`then`, never before.
// Multiple consumers share one execution.
export const getFlagsCanc = lazy<Flags>((resolve, reject, handleCancel) => {
 // Register teardown via handleCancel: runs if all consumers cancel before settle or on first cancel.
 handleCancel(() => {
 // Cleanup: e.g., abort pending request, release resources.
 console.log('Flags fetch canceled — teardown ran');
 });

 // Executor (runs on first subscription only):
 // Simulate async fetch (e.g., config service).
 setTimeout(() => {
 resolve({
 featureAlpha: true,
 featureBeta: false,
 premiumTier: true,
 });
 }, 50);
});

// Resettable variant: all-consumers-cancel before settle → reset, next await re-fetches.
export const getFlagsCancResettable = lazy<Flags>(
 (resolve, reject, handleCancel) => {
 handleCancel(() => {
 console.log('Flags fetch canceled — teardown ran, resettable now');
 });

 setTimeout(() => {
 resolve({
 featureAlpha: true,
 featureBeta: false,
 premiumTier: true,
 });
 }, 50);
 },
 { resettable: true },
);
