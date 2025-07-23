// Domain datasets and endpoints. Each endpoint is a thin wrapper over `MockApi.respond`, so every
// one of them honors an AbortSignal and shows up in `mockApi.calls`. Datasets are tiny and static;
// the point is signal-aware plumbing, not realistic data.

import { MockApi, AbortSignalLike, AbortError } from './core';

export interface Product {
 id: string;
 name: string;
 price: number;
}
export interface Order {
 id: string;
 productId: string;
 quantity: number;
}
export interface Flight {
 id: string;
 from: string;
 to: string;
 price: number;
}
export interface Supplier {
 id: string;
 name: string;
}
export interface Quote {
 supplierId: string;
 amount: number;
}
export interface Track {
 id: string;
 title: string;
 albumId: string;
}
export interface Album {
 id: string;
 title: string;
 artist: string;
}
export interface Invoice {
 id: string;
 customer: string;
 total: number;
 paid: boolean;
}
export interface Hotel {
 id: string;
 name: string;
 city: string;
 nightly: number;
}
export interface PricePoint {
 symbol: string;
 price: number;
 at: number;
}
export interface Issue {
 id: number;
 title: string;
 state: 'open' | 'closed';
}
export interface DocChunk {
 id: string;
 text: string;
 embedding: number[];
}
export interface Deployment {
 id: string;
 status: 'pending' | 'deployed' | 'failed';
}
export interface Payment {
 id: string;
 status: 'pending' | 'completed' | 'failed';
}
export interface Inventory {
 id: string;
 quantity: number;
}
export interface Mail {
 to: string;
 subject: string;
}

const PRODUCTS: Product[] = [
 { id: 'p1', name: 'Keyboard', price: 49 },
 { id: 'p2', name: 'Mouse', price: 25 },
 { id: 'p3', name: 'Monitor', price: 199 },
];
const ORDERS: Order[] = [
 { id: 'o1', productId: 'p1', quantity: 2 },
 { id: 'o2', productId: 'p3', quantity: 1 },
];
const FLIGHTS: Flight[] = [
 { id: 'f1', from: 'SFO', to: 'JFK', price: 320 },
 { id: 'f2', from: 'SFO', to: 'LAX', price: 90 },
 { id: 'f3', from: 'JFK', to: 'LHR', price: 540 },
];
const SUPPLIERS: Supplier[] = [
 { id: 's1', name: 'Acme' },
 { id: 's2', name: 'Globex' },
 { id: 's3', name: 'Initech' },
];
const ALBUMS: Album[] = [
 { id: 'a1', title: 'Kind of Blue', artist: 'Miles Davis' },
 { id: 'a2', title: 'Blue Train', artist: 'John Coltrane' },
];
const TRACKS: Track[] = [
 { id: 't1', title: 'So What', albumId: 'a1' },
 { id: 't2', title: 'Freddie Freeloader', albumId: 'a1' },
 { id: 't3', title: 'Blue Train', albumId: 'a2' },
];
const INVOICES: Invoice[] = [
 { id: 'inv1', customer: 'Wayne Ent', total: 1200, paid: false },
 { id: 'inv2', customer: 'Stark Ind', total: 8400, paid: true },
];
const HOTELS: Hotel[] = [
 { id: 'h1', name: 'The Grand', city: 'Paris', nightly: 240 },
 { id: 'h2', name: 'Seaside Inn', city: 'Nice', nightly: 130 },
];
const ISSUES: Issue[] = [
 { id: 1, title: 'Cancel does not propagate', state: 'open' },
 { id: 2, title: 'Types missing on any()', state: 'closed' },
];
const DOCS: Array<{ id: string; text: string }> = [
 { id: 'd1', text: 'Cancellation is a special rejection.' },
 { id: 'd2', text: 'Bubble propagates cancel upward.' },
 { id: 'd3', text: 'Shield protects cleanup from cancel.' },
];
const DEPLOYMENTS: Deployment[] = [
 { id: 'deploy-1', status: 'deployed' },
 { id: 'deploy-2', status: 'pending' },
 { id: 'deploy-3', status: 'failed' },
];
const PAYMENTS: Payment[] = [
 { id: 'payment-1', status: 'completed' },
 { id: 'payment-2', status: 'failed' },
 { id: 'payment-3', status: 'pending' },
];
const INVENTORY: Inventory[] = [
 { id: 'product-1', quantity: 10 },
 { id: 'product-2', quantity: 0 },
 { id: 'product-3', quantity: 5 },
];

function clone<T>(value: T): T {
 return JSON.parse(JSON.stringify(value)) as T;
}

// Deterministic fake embedding: 4 dims derived from character codes. Same text -> same vector.
function fakeEmbedding(text: string): number[] {
 const dims = [0, 0, 0, 0];
 for (let i = 0; i < text.length; i++) {
 dims[i % 4] += text.charCodeAt(i);
 }
 const norm = Math.sqrt(dims.reduce((sum, d) => sum + d * d, 0)) || 1;
 return dims.map((d) => Number((d / norm).toFixed(6)));
}

/** All domain endpoints, bound to one MockApi. Built by `createDomains`. */
export interface Domains {
 products: {
 list(signal?: AbortSignalLike): Promise<Product[]>;
 get(id: string, signal?: AbortSignalLike): Promise<Product>;
 };
 orders: {
 list(signal?: AbortSignalLike): Promise<Order[]>;
 forProduct(productId: string, signal?: AbortSignalLike): Promise<Order[]>;
 };
 flights: {
 search(from: string, to: string, signal?: AbortSignalLike): Promise<Flight[]>;
 };
 suppliers: {
 list(signal?: AbortSignalLike): Promise<Supplier[]>;
 quote(supplierId: string, signal?: AbortSignalLike): Promise<Quote>;
 };
 music: {
 albums(signal?: AbortSignalLike): Promise<Album[]>;
 tracks(albumId: string, signal?: AbortSignalLike): Promise<Track[]>;
 };
 invoices: {
 list(signal?: AbortSignalLike): Promise<Invoice[]>;
 get(id: string, signal?: AbortSignalLike): Promise<Invoice>;
 };
 hotels: {
 search(city: string, signal?: AbortSignalLike): Promise<Hotel[]>;
 };
 prices: {
 quote(symbol: string, signal?: AbortSignalLike): Promise<PricePoint>;
 };
 issues: {
 list(signal?: AbortSignalLike): Promise<Issue[]>;
 };
 rag: {
 search(query: string, signal?: AbortSignalLike): Promise<DocChunk[]>;
 };
 chat: {
 /** Streams tokens with a per-token delay, aborting mid-stream when the signal fires. */
 stream(prompt: string, signal?: AbortSignalLike): AsyncGenerator<string, void, void>;
 };
 deployments: {
 getStatus(id: string, signal?: AbortSignalLike): Promise<'pending' | 'deployed' | 'failed'>;
 };
 payments: {
 charge(id: string, signal?: AbortSignalLike): Promise<string>;
 };
 inventory: {
 check(id: string, signal?: AbortSignalLike): Promise<number>;
 };
 mail: {
 send(to: string, signal?: AbortSignalLike): Promise<void>;
 };
 gateway: {
 call(data: any, signal?: AbortSignalLike): Promise<{ transactionId: string }>;
 };
}

export function createDomains(api: MockApi): Domains {
 return {
 products: {
 list: (signal) => api.respond('products.list', {}, () => clone(PRODUCTS), signal),
 get: (id, signal) =>
 api.respond(
 'products.get',
 { id },
 () => {
 const found = PRODUCTS.find((p) => p.id === id);
 if (!found) throw new Error(`no product ${id}`);
 return clone(found);
 },
 signal
 ),
 },
 orders: {
 list: (signal) => api.respond('orders.list', {}, () => clone(ORDERS), signal),
 forProduct: (productId, signal) =>
 api.respond(
 'orders.forProduct',
 { productId },
 () => clone(ORDERS.filter((o) => o.productId === productId)),
 signal
 ),
 },
 flights: {
 search: (from, to, signal) =>
 api.respond(
 'flights.search',
 { from, to },
 () => clone(FLIGHTS.filter((f) => f.from === from && f.to === to)),
 signal
 ),
 },
 suppliers: {
 list: (signal) => api.respond('suppliers.list', {}, () => clone(SUPPLIERS), signal),
 quote: (supplierId, signal) =>
 api.respond(
 'suppliers.quote',
 { supplierId },
 () => ({ supplierId, amount: 100 + Math.floor(api.random() * 900) }),
 signal
 ),
 },
 music: {
 albums: (signal) => api.respond('music.albums', {}, () => clone(ALBUMS), signal),
 tracks: (albumId, signal) =>
 api.respond('music.tracks', { albumId }, () => clone(TRACKS.filter((t) => t.albumId === albumId)), signal),
 },
 invoices: {
 list: (signal) => api.respond('invoices.list', {}, () => clone(INVOICES), signal),
 get: (id, signal) =>
 api.respond(
 'invoices.get',
 { id },
 () => {
 const found = INVOICES.find((i) => i.id === id);
 if (!found) throw new Error(`no invoice ${id}`);
 return clone(found);
 },
 signal
 ),
 },
 hotels: {
 search: (city, signal) =>
 api.respond('hotels.search', { city }, () => clone(HOTELS.filter((h) => h.city === city)), signal),
 },
 prices: {
 quote: (symbol, signal) =>
 api.respond(
 'prices.quote',
 { symbol },
 () => ({ symbol, price: Number((10 + api.random() * 490).toFixed(2)), at: Date.now() }),
 signal
 ),
 },
 issues: {
 list: (signal) => api.respond('issues.list', {}, () => clone(ISSUES), signal),
 },
 rag: {
 search: (query, signal) =>
 api.respond(
 'rag.search',
 { query },
 () => {
 const queryVec = fakeEmbedding(query);
 return DOCS.map((d) => ({ id: d.id, text: d.text, embedding: fakeEmbedding(d.text) }))
 .map((chunk) => ({ chunk, score: dot(chunk.embedding, queryVec) }))
 .sort((a, b) => b.score - a.score)
 .map((ranked) => ranked.chunk);
 },
 signal
 ),
 },
 chat: {
 stream: (prompt, signal) => streamTokens(api, prompt, signal),
 },
 deployments: {
 getStatus: (id, signal) =>
 api.respond(
 'deployments.getStatus',
 { id },
 () => {
 const found = DEPLOYMENTS.find((d) => d.id === id);
 if (!found) throw new Error(`no deployment ${id}`);
 return found.status;
 },
 signal
 ),
 },
 payments: {
 charge: (id, signal) =>
 api.respond(
 'payments.charge',
 { id },
 () => {
 const found = PAYMENTS.find((p) => p.id === id);
 if (!found) throw new Error(`no payment ${id}`);
 if (found.status === 'failed') throw new Error('Payment failed');
 return `txn-${id}-${Date.now()}`;
 },
 signal
 ),
 },
 inventory: {
 check: (id, signal) =>
 api.respond(
 'inventory.check',
 { id },
 () => {
 const found = INVENTORY.find((i) => i.id === id);
 if (!found) throw new Error(`no inventory ${id}`);
 return found.quantity;
 },
 signal
 ),
 },
 mail: {
 send: (to, signal) =>
 api.respond(
 'mail.send',
 { to },
 () => {
 return undefined;
 },
 signal
 ),
 },
 gateway: {
 call: (data, signal) =>
 api.respond(
 'gateway.call',
 { data },
 () => ({ transactionId: `txn-${Date.now()}` }),
 signal
 ),
 },
 };
}

function dot(a: number[], b: number[]): number {
 return a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
}

// Token stream: one respond() per token so each token is independently abortable and traced. The
// generator throws AbortError out of whichever `respond` is in flight when the signal fires.
async function* streamTokens(
 api: MockApi,
 prompt: string,
 signal?: AbortSignalLike
): AsyncGenerator<string, void, void> {
 const tokens = `echo: ${prompt}`.split(/(\s+)/).filter((t) => t.length > 0);
 for (let i = 0; i < tokens.length; i++) {
 if (signal?.aborted) throw new AbortError();
 const token = await api.respond(`chat.token[${i}]`, { i }, () => tokens[i], signal);
 yield token;
 }
}
