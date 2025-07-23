import type { MockApiBundle } from '@shared/mock-api';

/**
 * Polls deployment status until it reaches 'deployed' or 'failed'. Plain promise: the poller
 * keeps running after the caller loses interest (e.g. user navigates away). Wasted API calls.
 */
export function waitForDeployment(
 mockApi: MockApiBundle,
 deploymentId: string
): Promise<string> {
 return new Promise((resolve) => {
 const poll = () => {
 mockApi.deployments.getStatus(deploymentId).then((status) => {
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
