// Vanilla approach: memoized-thunk caching, no reset mechanism.

import { sleep } from '@shared/util';

export interface Flags {
 featureAlpha: boolean;
 featureBeta: boolean;
 premiumTier: boolean;
}

let cached: Promise<Flags> | null = null;

// Memoized-thunk: executes once, returns cached promise thereafter.
export function getFlagsVanilla(): Promise<Flags> {
 if (!cached) {
 cached = fetchFlagsFromAPI();
 }
 return cached; // no way to un-fetch when nobody needs it anymore
}

async function fetchFlagsFromAPI(): Promise<Flags> {
 // Simulate async fetch (e.g., config service).
 await sleep(50);
 return {
 featureAlpha: true,
 featureBeta: false,
 premiumTier: true,
 };
}

// Reset cache for testing only (manual cache-buster needed).
export function resetFlagsCache(): void {
 cached = null; // no reset without manual cache-buster
}
