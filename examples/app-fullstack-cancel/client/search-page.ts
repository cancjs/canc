import { isCancelError, type CancelablePromise } from '@cancjs/promise';
import { debounce } from './lib/debounce';
import type { SearchApi, UserHit } from './api';

const TYPE_DEBOUNCE_MS = 250;

/**
 * A minimal but real search UI. Typing runs a debounced search; the Search button runs one
 * immediately; the Cancel button aborts whatever is in flight. Each new search cancels the previous
 * one, so a stale response can never overwrite a newer result, and a canceled search is treated as
 * "nothing happened", not an error.
 *
 * Framework-free on purpose. The UI layer is swappable: see the React example and the article
 * linked in the README for the same logic in a component.
 */
export function mountSearchPage(root: HTMLElement, api: SearchApi): void {
  root.innerHTML = `
    <main style="max-width:42rem;margin:2rem auto;font-family:system-ui,sans-serif">
      <h1 style="font-size:1.3rem">Cancelable user search</h1>
      <div style="display:flex;gap:.5rem">
        <input data-testid="query" aria-label="Search users" placeholder="Type a name or email"
               style="flex:1;padding:.5rem;font-size:1rem" />
        <button data-testid="search" type="button">Search</button>
        <button data-testid="cancel" type="button">Cancel</button>
      </div>
      <p data-testid="status" role="status" style="color:#555">Type to search</p>
      <ul data-testid="results" style="list-style:none;padding:0;margin:0"></ul>
    </main>
  `;

  const input = root.querySelector<HTMLInputElement>('[data-testid="query"]')!;
  const searchButton = root.querySelector<HTMLButtonElement>('[data-testid="search"]')!;
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-testid="cancel"]')!;
  const status = root.querySelector<HTMLParagraphElement>('[data-testid="status"]')!;
  const results = root.querySelector<HTMLUListElement>('[data-testid="results"]')!;

  let current: CancelablePromise<UserHit[]> | undefined;

  const setStatus = (text: string): void => {
    status.textContent = text;
  };

  const render = (hits: UserHit[]): void => {
    results.replaceChildren(
      ...hits.map((hit) => {
        const li = document.createElement('li');
        li.style.padding = '.4rem 0';
        li.style.borderBottom = '1px solid #eee';
        li.textContent = `${hit.name} — ${hit.email} (${hit.city}, ${hit.cityCount} nearby)`;
        return li;
      }),
    );
  };

  // Wire one search task as the current one. Because a superseded task is canceled, only the latest
  // ever reaches render; the losers reject with CancelError and are ignored.
  const track = (task: CancelablePromise<UserHit[]>): void => {
    current = task;
    task.then(
      (hits) => {
        if (task !== current) return;
        render(hits);
        setStatus(hits.length ? `${hits.length} result(s)` : 'No matches');
      },
      (error: unknown) => {
        if (task === current && !isCancelError(error)) setStatus('Search failed');
      },
    );
  };

  const begin = (task: CancelablePromise<UserHit[]>, query: string): void => {
    current?.cancel();
    if (!query.trim()) {
      current = undefined;
      task.cancel();
      render([]);
      setStatus('Type to search');
      return;
    }
    setStatus('Searching...');
    track(task);
  };

  const searchDebounced = debounce(TYPE_DEBOUNCE_MS, (query: string) => api.search(query));

  input.addEventListener('input', () => begin(searchDebounced(input.value), input.value));
  searchButton.addEventListener('click', () => begin(api.search(input.value), input.value));
  cancelButton.addEventListener('click', () => {
    current?.cancel();
    searchDebounced.cancel();
    current = undefined;
    setStatus('Canceled');
  });
}
