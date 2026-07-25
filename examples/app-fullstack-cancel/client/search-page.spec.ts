import { fireEvent, waitFor, within } from '@testing-library/dom';
import cancelableAxios from '@cancjs/axios';
import { createApi, type UserHit } from './api';
import { mountSearchPage } from './search-page';

const FIXTURE: UserHit[] = [
  { id: 1, name: 'Ada Lovelace', email: 'user1@example.com', city: 'London', cityCount: 3 },
  { id: 2, name: 'Alan Turing', email: 'user2@example.com', city: 'Lisbon', cityCount: 2 },
];

interface AdapterState {
  started: number;
  aborted: number;
}

// A fake axios adapter: it holds the request open for `latency` ms, and rejects the moment its
// AbortSignal fires. That abort is what proves the request was really canceled at the network
// boundary, not just ignored by the UI.
function fakeAdapter(state: AdapterState, latency = 50) {
  return (config: { signal?: AbortSignal }) =>
    new Promise((resolve, reject) => {
      state.started += 1;
      const timer = setTimeout(
        () => resolve({ data: FIXTURE, status: 200, statusText: 'OK', headers: {}, config }),
        latency,
      );
      config.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        state.aborted += 1;
        reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }));
      });
    });
}

function mount(state: AdapterState) {
  const http = cancelableAxios.create({ baseURL: '/api', adapter: fakeAdapter(state) as never });
  const root = document.createElement('div');
  document.body.appendChild(root);
  mountSearchPage(root, createApi(http));
  return within(root);
}

afterEach(() => {
  document.body.innerHTML = '';
});

test('shows results for a completed search', async () => {
  const state: AdapterState = { started: 0, aborted: 0 };
  const ui = mount(state);

  fireEvent.input(ui.getByLabelText('Search users'), { target: { value: 'ada' } });
  fireEvent.click(ui.getByText('Search'));

  await waitFor(() => expect(ui.getByText(/Ada Lovelace/)).toBeInTheDocument());
  expect(ui.getByRole('status')).toHaveTextContent('2 result(s)');
  expect(state.aborted).toBe(0);
});

test('clicking Cancel aborts the in-flight request and shows nothing', async () => {
  const state: AdapterState = { started: 0, aborted: 0 };
  const ui = mount(state);

  fireEvent.input(ui.getByLabelText('Search users'), { target: { value: 'ada' } });
  fireEvent.click(ui.getByText('Search'));

  // Wait until the request is actually in flight, then cancel it.
  await waitFor(() => expect(state.started).toBe(1));
  fireEvent.click(ui.getByText('Cancel'));

  // The abort reached the network, and no result or error is shown.
  await waitFor(() => expect(state.aborted).toBe(1));
  expect(ui.getByRole('status')).toHaveTextContent('Canceled');
  expect(ui.queryByText(/Ada Lovelace/)).not.toBeInTheDocument();
});
