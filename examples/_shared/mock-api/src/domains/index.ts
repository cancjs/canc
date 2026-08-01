// Composes every domain module into one bundle keyed by domain name. Each domain file owns its
// own dataset and endpoints; this file only wires them to a shared MockApi instance.

import { MockApi } from '../core';
import { ChatApi, createChatApi } from './chat';
import { createDeploymentsApi, DeploymentsApi } from './deployments';
import { createFlightsApi, FlightsApi } from './flights';
import { createGatewayApi, GatewayApi } from './gateway';
import { createHotelsApi, HotelsApi } from './hotels';
import { createInventoryApi, InventoryApi } from './inventory';
import { createInvoicesApi, InvoicesApi } from './invoices';
import { createIssuesApi, IssuesApi } from './issues';
import { createMailApi, MailApi } from './mail';
import { createMusicApi, MusicApi } from './music';
import { createOrdersApi, OrdersApi } from './orders';
import { createPaymentsApi, PaymentsApi } from './payments';
import { createPricesApi, PricesApi } from './prices';
import { createProductsApi, ProductsApi } from './products';
import { createRagApi, RagApi } from './rag';
import { createSuppliersApi, SuppliersApi } from './suppliers';

export type { ChatApi } from './chat';
export type { Deployment } from './deployments';
export type { Flight } from './flights';
export type { Hotel } from './hotels';
export type { Inventory } from './inventory';
export type { Invoice } from './invoices';
export type { Issue } from './issues';
export type { Mail } from './mail';
export type { Album, Track } from './music';
export type { Order } from './orders';
export type { Payment } from './payments';
export type { PricePoint } from './prices';
export type { Product } from './products';
export type { DocChunk, RagApi } from './rag';
export type { Quote, Supplier } from './suppliers';

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
