import { AbortSignalLike, MockApi } from '../core';

export interface GatewayApi {
  call(data: any, signal?: AbortSignalLike): Promise<{ transactionId: string }>;
}

export function createGatewayApi(api: MockApi): GatewayApi {
  return {
    call: (data, signal) =>
      api.respond('gateway.call', { data }, () => ({ transactionId: `txn-${Date.now()}` }), signal),
  };
}
