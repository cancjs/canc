import { createCancelSignal } from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

type GatewayApi = MockApiBundle['gateway'];

/**
 * Gateway call with signal interop. External AbortSignal from the caller and an internal
 * cancel signal are wired together. A cancellation or external signal
 * abort both stop the call immediately. Cancellation is a rejection; no special error-name
 * handling needed.
 */
export function callGatewayWithSignal(
 gatewayApi: GatewayApi,
 signal: AbortSignal
): Promise<{ transactionId: string }> {
 const { signal: innerSignal, cancel } = createCancelSignal();

 // Thread both signals together.
 const onAbort = () => cancel();
 signal.addEventListener('abort', onAbort);

 return gatewayApi.call({ method: 'pay', amount: 100 }, innerSignal).finally(() => {
 signal.removeEventListener('abort', onAbort);
 });
}
