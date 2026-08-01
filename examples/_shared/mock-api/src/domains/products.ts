import { clone } from '@shared/util';

import { AbortSignalLike, MockApi } from '../core';

export interface Product {
  id: string;
  name: string;
  price: number;
}

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Keyboard', price: 49 },
  { id: 'p2', name: 'Mouse', price: 25 },
  { id: 'p3', name: 'Monitor', price: 199 },
  { id: 'p4', name: 'Headphones', price: 79 },
];

export interface ProductsApi {
  list(signal?: AbortSignalLike): Promise<Product[]>;
  get(id: string, signal?: AbortSignalLike): Promise<Product>;
}

export function createProductsApi(api: MockApi): ProductsApi {
  return {
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
        signal,
      ),
  };
}
