import { MockApi, AbortSignalLike } from '../core';
import { clone } from '@shared/util';

export interface Issue {
 id: number;
 title: string;
 state: 'open' | 'closed';
}

const ISSUES: Issue[] = [
 { id: 1, title: 'Cancel does not propagate', state: 'open' },
 { id: 2, title: 'Types missing on any()', state: 'closed' },
];

export interface IssuesApi {
 list(signal?: AbortSignalLike): Promise<Issue[]>;
}

export function createIssuesApi(api: MockApi): IssuesApi {
 return {
 list: (signal) => api.respond('issues.list', {}, () => clone(ISSUES), signal),
 };
}
