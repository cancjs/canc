import {
  searchRepos,
  searchReposPreAborted,
  searchReposWithExternal,
  searchReposWithTimeout,
} from '../src/repo-search-canc';
import {
  searchRepos as searchReposVanilla,
  searchReposPreAborted as searchReposPreAbortedVanilla,
  searchReposWithExternal as searchReposWithExternalVanilla,
  searchReposWithTimeout as searchReposWithTimeoutVanilla,
} from '../src/repo-search-vanilla';

describe('types', () => {
  it('canc flavors return Promises', async () => {
    if (false as boolean) {
      const _canc1: Promise<any> = searchRepos('q', null);
      const _canc2: Promise<any> = searchReposWithExternal('q', null);
      const _canc3: Promise<any> = searchReposPreAborted('q', null);
      const _canc4: Promise<any> = searchReposWithTimeout('q', null);

      const _vanilla1: Promise<any> = searchReposVanilla('q', null);
      const _vanilla2: Promise<any> = searchReposWithExternalVanilla('q', null);
      const _vanilla3: Promise<any> = searchReposPreAbortedVanilla('q', null);
      const _vanilla4: Promise<any> = searchReposWithTimeoutVanilla('q', null);
    }

    expect(true).toBe(true);
  });
});
