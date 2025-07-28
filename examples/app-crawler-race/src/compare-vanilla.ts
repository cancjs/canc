// Fan out the same quote request to every supplier and take the first answer.
//
// Vanilla Promise.any resolves with the first fulfillment, but the losing requests keep running to
// completion. In a real price-comparison backend that is N-1 supplier calls whose results are
// thrown away: wasted bandwidth, wasted supplier rate-limit budget, wasted money.

import type { MockApiBundle } from '@shared/mock-api';
import { quotePart, SUPPLIER_IDS, TARGET_PART } from './aux/catalog';
import type { PartQuote } from './types';

// (no cancellation counterpart — see compare-canc.ts)
export async function firstQuote(mockApi: MockApiBundle, part: string): Promise<PartQuote> {
 const requests = SUPPLIER_IDS.map((supplierId) => quotePart(mockApi, supplierId, part));

 // First fulfillment wins.
 const winner = await Promise.any(requests);

 // losers keep running — nothing cancels them, so all N calls complete anyway (wasted work)
 return winner;
}

// race() variant: first to SETTLE wins (fulfill or reject). With Promise.race a rejecting supplier
// would surface its error; with any() only an all-reject surfaces (AggregateError). Same leak here:
// the losing requests keep running regardless.
export async function firstQuoteRace(mockApi: MockApiBundle, part: string): Promise<PartQuote> {
 const requests = SUPPLIER_IDS.map((supplierId) => quotePart(mockApi, supplierId, part));

 const winner = await Promise.race(requests);

 // losers keep running — same wasted work as any()
 return winner;
}

export async function compareVanilla(mockApi: MockApiBundle): Promise<void> {
 console.log(`vanilla: quoting ${TARGET_PART} from ${SUPPLIER_IDS.length} suppliers via any()`);
 const winner = await firstQuote(mockApi, TARGET_PART);
 console.log(`vanilla: winner ${winner.supplierId} at ${winner.amount}`);

 // Give the losing requests time to finish so their completed markers land in the call log.
 await new Promise((resolve) => setTimeout(resolve, 120));
 const completed = mockApi.api.calls.filter(
 (call) => call.endpoint === 'catalog.quote' && call.status === 'completed'
 ).length;
 console.log(`vanilla: quote calls completed = ${completed} (all suppliers ran to the end)`);
}
