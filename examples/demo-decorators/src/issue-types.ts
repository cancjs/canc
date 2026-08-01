// Shared shapes for every flavor of IssueClient. Suffix-free: identical across all four wirings,
// so only the decorator/wiring mechanics differ between the twin files.

import type { Issue, MockApiBundle } from '@shared/mock-api';

export type { Issue };
export type IssuesApi = MockApiBundle['issues'];

/** Acknowledgement returned by saveComment. The mock API has no write endpoint, so the client
 * reads the issue back and echoes the comment; see the README honesty note. */
export interface CommentAck {
  issueId: number;
  comment: string;
  issueTitle: string;
}

/** The one class shape every flavor implements. Method bodies differ only in how they are wired
 * (stage-3 decorator, TS-legacy decorator, babel-legacy decorator, manual constructor wiring). */
export interface IssueClientShape {
  searchIssues(query: string): Promise<Issue[]>;
  loadIssue(id: number): Promise<Issue>;
  saveComment(id: number, comment: string): Promise<CommentAck>;
}
