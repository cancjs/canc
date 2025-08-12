export interface Repo {
 id: string;
 name: string;
 url: string;
 readme: string;
}

export interface RepoSearchResult {
 repos: Repo[];
 query: string;
}
