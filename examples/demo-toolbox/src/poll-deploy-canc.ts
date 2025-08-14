import CancelablePromise from '@cancjs/promise';
import { waitFor } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

type DeploymentsApi = MockApiBundle['deployments'];

/**
 * Polls deployment status using the toolbox waitFor utility bound to CancelablePromise.
 * cancel() stops polling immediately and clears the pending timer. User navigates away;
 * promise canceled; poll stops; no more API calls.
 */
export function waitForDeployment(
 deploymentsApi: DeploymentsApi,
 deploymentId: string
): Promise<string> {
 let lastStatus: string | null = null;

 return waitFor(async () => {
 lastStatus = await deploymentsApi.getStatus(deploymentId);
 return lastStatus === 'deployed' || lastStatus === 'failed';
 }, { interval: 100, impl: CancelablePromise as any }).then(() => lastStatus!);
}
