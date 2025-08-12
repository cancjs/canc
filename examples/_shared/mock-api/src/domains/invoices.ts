import { MockApi, AbortSignalLike } from '../core';
import { clone } from '@shared/util';

export interface Invoice {
 id: string;
 customer: string;
 total: number;
 paid: boolean;
}

const INVOICES: Invoice[] = [
 { id: 'inv1', customer: 'Wayne Ent', total: 1200, paid: false },
 { id: 'inv2', customer: 'Stark Ind', total: 8400, paid: true },
];

export interface InvoicesApi {
 list(signal?: AbortSignalLike): Promise<Invoice[]>;
 get(id: string, signal?: AbortSignalLike): Promise<Invoice>;
}

export function createInvoicesApi(api: MockApi): InvoicesApi {
 return {
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
 };
}
