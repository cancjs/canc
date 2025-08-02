// Shared types + a market-api factory used by both store twins and every flavor. Not sensitive to
// cancellation, so it has no -vanilla / -canc split.

import { createMarketApi, MarketApi } from './mock/market-api';
import type { Quote, HistoryPoint } from './mock/market-api';

export type { Quote, HistoryPoint };
export type { MarketApi };

export const WATCHLIST = ['BTC', 'ETH', 'SOL', 'AAPL', 'TSLA'] as const;
export type Symbol = (typeof WATCHLIST)[number];

export interface Loaded {
 symbol: Symbol;
 quote: Quote;
 history: HistoryPoint[];
}

/** One shared market feed per app. Tests pass their own instance to inspect the call log. */
export function makeMarketApi(trace?: (line: string) => void): MarketApi {
 return createMarketApi({ latency: 40, trace });
}
