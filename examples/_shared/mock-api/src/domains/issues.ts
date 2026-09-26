import { clone } from '@shared/util';

import { AbortSignalLike, MockApi } from '../core';

export interface Comment {
  id: number;
  text: string;
  author: string;
}

export interface Issue {
  id: number;
  title: string;
  status: 'open' | 'closed';
  comments?: Comment[];
}

export interface SearchResult {
  issues: Issue[];
  query: string;
}

const ISSUES: Issue[] = [
  {
    id: 1,
    title: 'Bug: cancel does not propagate',
    status: 'open',
    comments: [{ id: 101, text: 'Still looking into this', author: 'alice' }],
  },
  {
    id: 2,
    title: 'Feature: types missing on any()',
    status: 'open',
    comments: [{ id: 102, text: 'RFC draft ready', author: 'bob' }],
  },
  {
    id: 3,
    title: 'Feature: support axios 1.16',
    status: 'closed',
    comments: [],
  },
];

export interface IssuesApi {
  list(signal?: AbortSignalLike): Promise<Issue[]>;
  search(query: string, signal?: AbortSignalLike): Promise<SearchResult>;
  get(id: number, signal?: AbortSignalLike): Promise<Issue>;
}

export function createIssuesApi(api: MockApi): IssuesApi {
  return {
    list: (signal) => api.respond('issues.list', {}, () => clone(ISSUES), signal),
    search: (query, signal) =>
      api.respond(
        'issues.search',
        { query },
        () => ({
          issues: clone(ISSUES).filter((i) => i.title.toLowerCase().includes(query.toLowerCase())),
          query,
        }),
        signal,
      ),
    get: (id, signal) =>
      api.respond(
        'issues.get',
        { id },
        () => {
          const issue = ISSUES.find((i) => i.id === Number(id));
          if (!issue) throw new Error(`no issue ${id}`);
          return clone(issue);
        },
        signal,
      ),
  };
}
