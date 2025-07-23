import CancelablePromise from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * CancelablePromise poller: cancel() stops polling immediately. handleCancel() allows cleanup
 * of pending timers. User navigates away → promise canceled → poll stops → no more API calls.
 */
export function waitForDeployment(
 mockApi: MockApiBundle,
 deploymentId: string
): CancelablePromise<string> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 let timeoutId: NodeJS.Timeout | null = null;

 const cleanup = () => {
 if (timeoutId !== null) {
 clearTimeout(timeoutId);
 timeoutId = null;
 }
 };
 handleCancel(cleanup);

 const poll = () => {
 mockApi.deployments.getStatus(deploymentId).then((status) => {
 if (status === 'deployed' || status === 'failed') {
 cleanup();
 resolve(status);
 } else {
 timeoutId = setTimeout(poll, 100);
 }
 });
 };
 poll();
 });
}
