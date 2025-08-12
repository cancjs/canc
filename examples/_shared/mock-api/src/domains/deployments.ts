import { MockApi, AbortSignalLike } from '../core';

export interface Deployment {
 id: string;
 status: 'pending' | 'deployed' | 'failed';
}

const DEPLOYMENTS: Deployment[] = [
 { id: 'deploy-1', status: 'deployed' },
 { id: 'deploy-2', status: 'pending' },
 { id: 'deploy-3', status: 'failed' },
];

export interface DeploymentsApi {
 getStatus(id: string, signal?: AbortSignalLike): Promise<'pending' | 'deployed' | 'failed'>;
}

export function createDeploymentsApi(api: MockApi): DeploymentsApi {
 return {
 getStatus: (id, signal) =>
 api.respond(
 'deployments.getStatus',
 { id },
 () => {
 const found = DEPLOYMENTS.find((d) => d.id === id);
 if (!found) throw new Error(`no deployment ${id}`);
 return found.status;
 },
 signal
 ),
 };
}
