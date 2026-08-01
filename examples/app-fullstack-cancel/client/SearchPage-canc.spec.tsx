import { CancelablePromise } from '@cancjs/promise';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { SearchApi } from './api-canc';
import { SearchPage } from './SearchPage-canc';
import type { UserHit } from './user-hit';

// A fake API that records which queries it was asked to search and which were canceled. Canceling a
// search is what proves a superseded request was really stopped, not ignored.
function makeApi() {
  const searched: string[] = [];
  const canceled: string[] = [];
  const resolvers = new Map<string, (hits: UserHit[]) => void>();
  const api: SearchApi = {
    search: (query) => {
      searched.push(query);
      return new CancelablePromise<UserHit[]>((resolve, _reject, { handleCancel }) => {
        resolvers.set(query, resolve);
        handleCancel?.(() => canceled.push(query));
      });
    },
  };
  return { api, searched, canceled, resolvers };
}

test('shows results for the settled search', async () => {
  const { api, searched, resolvers } = makeApi();
  render(<SearchPage api={api} />);

  fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'ada' } });
  await waitFor(() => expect(searched).toContain('ada'));
  resolvers.get('ada')!([{ id: 1, name: 'Ada Lovelace', email: 'a@example.com', city: 'London', cityCount: 3 }]);

  await screen.findByText(/Ada Lovelace/);
});

test('debounces: rapid keystrokes only search the last value', async () => {
  const { api, searched } = makeApi();
  render(<SearchPage api={api} />);

  const input = screen.getByLabelText('Search users');
  fireEvent.change(input, { target: { value: 'a' } });
  fireEvent.change(input, { target: { value: 'ab' } });

  await waitFor(() => expect(searched).toContain('ab'));
  expect(searched).not.toContain('a');
});

test('cancels the pending search on unmount', async () => {
  const { api, searched, canceled } = makeApi();
  const { unmount } = render(<SearchPage api={api} />);

  fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'zed' } });
  await waitFor(() => expect(searched).toContain('zed'));
  unmount();

  await waitFor(() => expect(canceled).toContain('zed'));
});
