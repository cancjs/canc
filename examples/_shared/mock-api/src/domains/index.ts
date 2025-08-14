// Composes every domain module into one bundle keyed by domain name. Each domain file owns its
// own dataset and endpoints; this file only wires them to a shared MockApi instance.

import { MockApi } from '../core';

import { createProductsApi, ProductsApi } from './products';
import { createOrdersApi, OrdersApi } from './orders';
import { createFlightsApi, FlightsApi } from './flights';
import { createSuppliersApi, SuppliersApi } from './suppliers';
import { createMusicApi, MusicApi } from './music';
import { createInvoicesApi, InvoicesApi } from './invoices';
import { createHotelsApi, HotelsApi } from './hotels';
import { createPricesApi, PricesApi } from './prices';
import { createIssuesApi, IssuesApi } from './issues';
import { createRagApi, RagApi } from './rag';
import { createChatApi, ChatApi } from './chat';
import { createDeploymentsApi, DeploymentsApi } from './deployments';
import { createPaymentsApi, PaymentsApi } from './payments';
import { createInventoryApi, InventoryApi } from './inventory';
import { createMailApi, MailApi } from './mail';
import { createGatewayApi, GatewayApi } from './gateway';

export type {
 Product,
} from './products';
export type { Order } from './orders';
export type { Flight } from './flights';
export type { Supplier, Quote } from './suppliers';
export type { Album, Track } from './music';
export type { Invoice } from './invoices';
export type { Hotel } from './hotels';
export type { PricePoint } from './prices';
export type { Issue } from './issues';
export type { DocChunk, RagApi } from './rag';
export type { ChatApi } from './chat';
export type { Deployment } from './deployments';
export type { Payment } from './payments';
export type { Inventory } from './inventory';
export type { Mail } from './mail';

/** All domain endpoints, bound to one MockApi. Built by `createDomains`. */
export interface Domains {
 products: ProductsApi;
 orders: OrdersApi;
 flights: FlightsApi;
 suppliers: SuppliersApi;
 music: MusicApi;
 invoices: InvoicesApi;
 hotels: HotelsApi;
 prices: PricesApi;
 issues: IssuesApi;
 rag: RagApi;
 chat: ChatApi;
 deployments: DeploymentsApi;
 payments: PaymentsApi;
 inventory: InventoryApi;
 mail: MailApi;
 gateway: GatewayApi;
}

export function createDomains(api: MockApi): Domains {
 return {
 products: createProductsApi(api),
 orders: createOrdersApi(api),
 flights: createFlightsApi(api),
 suppliers: createSuppliersApi(api),
 music: createMusicApi(api),
 invoices: createInvoicesApi(api),
 hotels: createHotelsApi(api),
 prices: createPricesApi(api),
 issues: createIssuesApi(api),
 rag: createRagApi(api),
 chat: createChatApi(api),
 deployments: createDeploymentsApi(api),
 payments: createPaymentsApi(api),
 inventory: createInventoryApi(api),
 mail: createMailApi(api),
 gateway: createGatewayApi(api),
 };
}
