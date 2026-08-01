import { clone } from '@shared/util';

import { AbortSignalLike, MockApi } from '../core';

export interface Supplier {
  id: string;
  name: string;
}
export interface Quote {
  supplierId: string;
  amount: number;
}

const SUPPLIERS: Supplier[] = [
  { id: 's1', name: 'Acme' },
  { id: 's2', name: 'Globex' },
  { id: 's3', name: 'Initech' },
];

export interface SuppliersApi {
  list(signal?: AbortSignalLike): Promise<Supplier[]>;
  quote(supplierId: string, signal?: AbortSignalLike): Promise<Quote>;
}

export function createSuppliersApi(api: MockApi): SuppliersApi {
  return {
    list: (signal) => api.respond('suppliers.list', {}, () => clone(SUPPLIERS), signal),
    quote: (supplierId, signal) =>
      api.respond(
        'suppliers.quote',
        { supplierId },
        () => ({ supplierId, amount: 100 + Math.floor(api.random() * 900) }),
        signal,
      ),
  };
}
