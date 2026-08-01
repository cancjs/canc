/**
 * Shared types for the issue tracker example.
 */

export interface Issue {
  id: number;
  title: string;
  status: 'open' | 'closed';
  comments?: Comment[];
}

export interface Comment {
  id: number;
  text: string;
  author: string;
}

export interface SearchResult {
  issues: Issue[];
  query: string;
}
