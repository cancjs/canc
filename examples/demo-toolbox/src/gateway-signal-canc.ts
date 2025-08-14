import { createAbortSignal } from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

type GatewayApi = MockApiBundle['gateway'];

/**
 * Gateway call with signal interop. External AbortSignal from the caller and an internal
 * cancel via createAbortSignal are wired together. A cancellation or external signal
 * abort both stop the call immediately. Cancellation is a rejection; no special error-name
 * handling needed.
 */
export function callGatewayWithSignal(
 gatewayApi: GatewayApi,
 signal: AbortSignal
): Promise<{ transactionId: string }> {
 const { signal: innerSignal, abort } = createAbortSignal();

 // Thread both signals together.
 const onAbort = () => abort();
 signal.addEventListener('abort', onAbort);

 return gatewayApi.call({ method: 'pay', amount: 100 }, innerSignal).finally(() => {
 signal.removeEventListener('abort', onAbort);
 });
}
