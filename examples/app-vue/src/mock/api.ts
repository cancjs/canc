// Aux code: a fake marketplace API for the example, built on the shared MockApi engine so a cancel
// really reaches a simulated network boundary (see the started/aborted markers in `api.calls`).
// Pretend this is your backend. This is scaffolding, not a copy target.
//
// Two endpoints: a catalog listing that takes a category filter, and a per-product image lookup.
// Image latency is deliberately higher than the listing so a burst of filter changes leaves image
// prefetches in flight (the fanout the example cancels). The shared domains ship generic product
// endpoints, but a filtered catalog plus an image URL lookup are specific to this example, so they
// are defined here on top of the same signal-aware `respond`.

import { MockApi, type AbortSignalLike } from '@shared/mock-api';

export interface Product {
 id: string;
 name: string;
 category: string;
 price: number;
}

const CATALOG: Product[] = [
 { id: 'kb-1', name: 'Mechanical Keyboard', category: 'peripherals', price: 89 },
 { id: 'ms-1', name: 'Wireless Mouse', category: 'peripherals', price: 39 },
 { id: 'hp-1', name: 'Studio Headphones', category: 'audio', price: 149 },
 { id: 'sp-1', name: 'Desk Speakers', category: 'audio', price: 120 },
 { id: 'mn-1', name: '27-inch Monitor', category: 'displays', price: 299 },
 { id: 'mn-2', name: 'Portable Monitor', category: 'displays', price: 189 },
];

/** Category filters the catalog page offers. `all` returns the whole catalog. */
export const CATEGORIES = ['all', 'peripherals', 'audio', 'displays'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface MarketplaceApi {
 /** The shared call log. `aborted` markers here prove a cancel reached the fake network. */
 readonly calls: MockApi['calls'];
 listProducts(category: Category, signal?: AbortSignalLike): Promise<Product[]>;
 productImage(id: string, signal?: AbortSignalLike): Promise<string>;
}

/**
 * Builds a marketplace API over one MockApi instance. `latency` drives both endpoints; the image
 * prefetch runs after the listing resolves, so switching filters mid-load leaves image prefetches
 * to be canceled. A test can pass its own `latency` and a `trace` sink to watch the log.
 */
export function createMarketplaceApi(options: { latency?: number; trace?: (line: string) => void } = {}): MarketplaceApi {
 const api = new MockApi({ latency: options.latency ?? 200, jitter: 0, trace: options.trace });

 return {
 calls: api.calls,
 listProducts: (category, signal) =>
 api.respond(
 'catalog.list',
 { category },
 () => (category === 'all' ? CATALOG.slice() : CATALOG.filter((p) => p.category === category)),
 signal
 ),
 productImage: (id, signal) =>
 api.respond('catalog.image', { id }, () => `https://cdn.example/img/${id}.webp`, signal),
 };
}
