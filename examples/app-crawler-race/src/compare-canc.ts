// Fan out the same quote request to every supplier and take the first answer.
//
// CancelablePromise.any resolves with the first fulfillment and cancels the losing inputs. Each
// canceled input aborts its underlying request, so only 1 of N supplier calls completes. The other
// N-1 are aborted the instant a winner appears: bandwidth saved, supplier budget saved, money saved.

import { CancelablePromise } from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';
import { quotePart, SUPPLIER_IDS, TARGET_PART } from './aux/catalog';
import type { PartQuote } from './types';

function quote(mockApi: MockApiBundle, supplierId: string, part: string): CancelablePromise<PartQuote> {
 return new CancelablePromise<PartQuote>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 quotePart(mockApi, supplierId, part, controller.signal).then(resolve, reject);
 // canceled here — the abort signal fires and the underlying request is aborted, nothing below runs
 handleCancel(() => controller.abort());
 });
}

export async function firstQuote(mockApi: MockApiBundle, part: string): Promise<PartQuote> {
 const requests = SUPPLIER_IDS.map((supplierId) => quote(mockApi, supplierId, part));

 // First fulfillment wins; losers are canceled.
 const winner = await CancelablePromise.any(requests);

 // losers canceled — the N-1 remaining requests are aborted, none complete (saved work)
 return winner;
}

// race() variant: first to SETTLE wins (fulfill or reject). CancelablePromise.race cancels the
// losers exactly like any(); the difference is any() waits for the first FULFILLMENT while race()
// takes the first settlement, so a fast rejection would win a race but be skipped by any().
export async function firstQuoteRace(mockApi: MockApiBundle, part: string): Promise<PartQuote> {
 const requests = SUPPLIER_IDS.map((supplierId) => quote(mockApi, supplierId, part));

 const winner = await CancelablePromise.race(requests);

 // losers canceled — same saved work as any()
 return winner;
}

export async function compareCanc(mockApi: MockApiBundle): Promise<void> {
 console.log(`canc: quoting ${TARGET_PART} from ${SUPPLIER_IDS.length} suppliers via any()`);
 const winner = await firstQuote(mockApi, TARGET_PART);
 console.log(`canc: winner ${winner.supplierId} at ${winner.amount}`);

 // Wait the same amount of time; the losers were aborted, so no extra completions appear.
 await new Promise((resolve) => setTimeout(resolve, 120));
 const completed = mockApi.api.calls.filter(
 (call) => call.endpoint === 'catalog.quote' && call.status === 'completed'
 ).length;
 const aborted = mockApi.api.calls.filter(
 (call) => call.endpoint === 'catalog.quote' && call.status === 'aborted'
 ).length;
 console.log(`canc: quote calls completed = ${completed}, aborted = ${aborted} (losers stopped)`);
}
