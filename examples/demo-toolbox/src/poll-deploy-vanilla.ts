import type { MockApiBundle } from '@shared/mock-api';

type DeploymentsApi = MockApiBundle['deployments'];

/**
 * Polls deployment status until it reaches deployed or failed. Plain promise: the poller
 * keeps running after the caller loses interest (user navigates away, wasted API calls).
 * Cancellation requires manual flag tracking or a separate mechanism outside this function.
 */
export function waitForDeployment(
 deploymentsApi: DeploymentsApi,
 deploymentId: string
): Promise<string> {
 return new Promise((resolve) => {
 const poll = () => {
 deploymentsApi.getStatus(deploymentId).then((status) => {
 if (status === 'deployed' || status === 'failed') {
 resolve(status);
 } else {
 setTimeout(poll, 100);
 }
 });
 };
 poll();
 });
}
