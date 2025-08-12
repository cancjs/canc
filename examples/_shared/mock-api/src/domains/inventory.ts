import { MockApi, AbortSignalLike } from '../core';

export interface Inventory {
 id: string;
 quantity: number;
}

const INVENTORY: Inventory[] = [
 { id: 'product-1', quantity: 10 },
 { id: 'product-2', quantity: 0 },
 { id: 'product-3', quantity: 5 },
];

export interface InventoryApi {
 check(id: string, signal?: AbortSignalLike): Promise<number>;
}

export function createInventoryApi(api: MockApi): InventoryApi {
 return {
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
 };
}
