// Per-example scaffolding: a product catalog backend on top of the shared MockApi. Pretend this is
// your real product service. Every call runs through MockApi.respond, so it honors an AbortSignal
// and shows up in the call log with started/completed/aborted markers. Black box for the reader;
// the teaching payload lives in src/ProductDetail-*.vue and src/lib/cancelable-setup.ts.

import { type AbortSignalLike, createMockApi } from '@shared/mock-api';

export interface ProductDetail {
  id: string;
  name: string;
  price: number;
  description: string;
}

const CATALOG: Omit<ProductDetail, 'description'>[] = [
  { id: 'p1', name: 'Keyboard', price: 49 },
  { id: 'p2', name: 'Mouse', price: 25 },
  { id: 'p3', name: 'Monitor', price: 199 },
  { id: 'p4', name: 'Headphones', price: 79 },
];

// Latency is high enough that a user can open one product and switch to another before the first
// detail load settles (the abandon-mid-load story the example is about).
const mock = createMockApi({ latency: 500, jitter: 0 });

export const mockCalls = mock.api.calls;

export const PRODUCT_IDS = CATALOG.map((product) => product.id);

export function loadProductDetail(id: string, signal?: AbortSignalLike): Promise<ProductDetail> {
  return mock.api.respond(
    'catalog.loadProductDetail',
    { id },
    () => {
      const found = CATALOG.find((product) => product.id === id);
      if (!found) throw new Error(`no product ${id}`);
      return { ...found, description: `${found.name} — in stock, ships today.` };
    },
    signal,
  );
}
