// Aux code: a fake orders API for the example, built on the shared MockApi engine so cancellation
// really reaches a simulated network boundary (see the started/aborted markers in `api.calls`).
// Pretend this is your backend. This is scaffolding, not a copy target.
//
// The shared domains ship `orders.list`, but the dashboard also needs a per-order detail lookup
// with enough latency that switching rows leaves the previous detail request in flight (the race
// the example is about). That detail endpoint is defined here on top of the same signal-aware
// `respond`.

import { MockApi, type AbortSignalLike } from '@shared/mock-api';

export interface OrderSummary {
 id: string;
 customer: string;
 total: number;
 status: 'paid' | 'pending' | 'refunded';
}

export interface OrderDetail extends OrderSummary {
 placedAt: string;
 shippingAddress: string;
 lines: { sku: string; name: string; qty: number; price: number }[];
}

const ORDERS: OrderSummary[] = [
 { id: 'o1001', customer: 'Wayne Enterprises', total: 1240, status: 'paid' },
 { id: 'o1002', customer: 'Stark Industries', total: 89, status: 'pending' },
 { id: 'o1003', customer: 'Umbrella Corp', total: 512, status: 'refunded' },
 { id: 'o1004', customer: 'Cyberdyne Systems', total: 3300, status: 'paid' },
 { id: 'o1005', customer: 'Gekko & Co', total: 47, status: 'pending' },
];

const CATALOG = [
 { sku: 'KB-01', name: 'Keyboard', price: 49 },
 { sku: 'MS-02', name: 'Mouse', price: 25 },
 { sku: 'MN-03', name: 'Monitor', price: 199 },
 { sku: 'HS-04', name: 'Headset', price: 88 },
];

export interface OrdersApi {
 /** The shared call log. `aborted` markers here prove a cancel reached the fake network. */
 readonly calls: MockApi['calls'];
 listOrders(signal?: AbortSignalLike): Promise<OrderSummary[]>;
 orderDetail(id: string, signal?: AbortSignalLike): Promise<OrderDetail>;
}

/**
 * Builds an orders API over one MockApi instance. `latency` lets a test drive timing; the default
 * gives a realistic feel where switching rows outruns the detail responses.
 */
export function createOrdersApi(options: { latency?: number; trace?: (line: string) => void } = {}): OrdersApi {
 const api = new MockApi({ latency: options.latency ?? 300, jitter: 0, trace: options.trace });

 return {
 calls: api.calls,
 listOrders: (signal) => api.respond('orders.list', {}, () => ORDERS.map((o) => ({ ...o })), signal),
 orderDetail: (id, signal) =>
 api.respond(
 'orders.detail',
 { id },
 () => {
 const found = ORDERS.find((o) => o.id === id);
 if (!found) throw new Error(`no order ${id}`);
 const seed = found.id.charCodeAt(found.id.length - 1);
 const lineCount = 1 + (seed % CATALOG.length);
 return {
 ...found,
 placedAt: `2026-0${1 + (seed % 9)}-1${seed % 9}`,
 shippingAddress: `${100 + seed} Market St`,
 lines: CATALOG.slice(0, lineCount).map((item, i) => ({ ...item, qty: 1 + ((seed + i) % 3) })),
 };
 },
 signal
 ),
 };
}
