import {
  searchRepos,
  searchReposPreAborted,
  searchReposWithExternal,
  searchReposWithTimeout,
} from '../src/repo-search-canc';
import { searchRepos as searchReposVanilla, searchReposAbortable } from '../src/repo-search-vanilla';

describe('types', () => {
  it('canc flavors return Promises', async () => {
    // This is a compile-time check; the test body is a no-op.
    const _canc1: Promise<any> = searchRepos('q', null);
    const _canc2: Promise<any> = searchReposWithExternal('q', null);
    const _canc3: Promise<any> = searchReposPreAborted('q', null);
    const _canc4: Promise<any> = searchReposWithTimeout('q', null);

    const _vanilla1: Promise<any> = searchReposVanilla('q', null);
    const _vanilla2: Promise<any> = searchReposAbortable('q', null);

    expect(true).toBe(true);
  });
});
