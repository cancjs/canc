import { MockApi, AbortSignalLike } from '../core';

export interface Payment {
 id: string;
 status: 'pending' | 'completed' | 'failed';
}

const PAYMENTS: Payment[] = [
 { id: 'payment-1', status: 'completed' },
 { id: 'payment-2', status: 'failed' },
 { id: 'payment-3', status: 'pending' },
];

export interface PaymentsApi {
 charge(id: string, signal?: AbortSignalLike): Promise<string>;
}

export function createPaymentsApi(api: MockApi): PaymentsApi {
 return {
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
 };
}
