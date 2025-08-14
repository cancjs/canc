import type { MockApiBundle } from '@shared/mock-api';

/**
 * Gateway call threaded with AbortSignal. Vanilla: all signal wiring is manual (controller
 * creation, thread-down, error-name check). Cancellation coupling is loose; a caller must
 * manage the signal lifecycle.
 */
export function callGatewayWithSignal(
 mockApi: MockApiBundle,
 signal: AbortSignal
): Promise<{ transactionId: string }> {
 return mockApi.gateway.call({ method: 'pay', amount: 100 }, signal);
}
