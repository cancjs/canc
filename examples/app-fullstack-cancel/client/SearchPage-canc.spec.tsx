import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CancelablePromise } from '@cancjs/promise';
import { SearchPage } from './SearchPage-canc';
import type { SearchApi } from './api-canc';
import type { UserHit } from './user-hit';

// A fake API whose searches are controllable promises, and that records which queries were canceled.
// Canceling a search is what proves a superseded request was really stopped, not ignored.
function makeApi() {
  const canceled: string[] = [];
  const resolvers = new Map<string, (hits: UserHit[]) => void>();
  const api: SearchApi = {
    search: (query) =>
      new CancelablePromise<UserHit[]>((resolve, _reject, handleCancel) => {
        resolvers.set(query, resolve);
        handleCancel?.(() => canceled.push(query));
      }),
  };
  return { api, canceled, resolvers };
}

test('shows results for the settled search', async () => {
  const { api, resolvers } = makeApi();
  render(<SearchPage api={api} />);

  fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'ada' } });
  resolvers.get('ada')!([
    { id: 1, name: 'Ada Lovelace', email: 'a@example.com', city: 'London', cityCount: 3 },
  ]);

  await screen.findByText(/Ada Lovelace/);
});

test('each keystroke cancels the previous search', async () => {
  const { api, canceled } = makeApi();
  render(<SearchPage api={api} />);

  const input = screen.getByLabelText('Search users');
  fireEvent.change(input, { target: { value: 'a' } });
  fireEvent.change(input, { target: { value: 'ab' } });

  await waitFor(() => expect(canceled).toContain('a'));
  expect(canceled).not.toContain('ab');
});

test('cancels the pending search on unmount', async () => {
  const { api, canceled } = makeApi();
  const { unmount } = render(<SearchPage api={api} />);

  fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'zed' } });
  unmount();

  await waitFor(() => expect(canceled).toContain('zed'));
});
