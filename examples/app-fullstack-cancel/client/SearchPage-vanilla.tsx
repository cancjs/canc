import { useEffect, useMemo, useState } from 'react';

import type { SearchApi } from './api-vanilla';
import type { UserHit } from './user-hit';

const DEBOUNCE_MS = 250;

// wait specified ms or reject early on signal abort
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

// debounce built on AbortSignal where each call aborts previous wait or in-flight request
function debounce<Args extends unknown[], R>(fn: (signal: AbortSignal, ...args: Args) => Promise<R>, ms: number) {
  let controller: AbortController | undefined;
  const run = (...args: Args): Promise<R> => {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    return wait(ms, signal).then(() => fn(signal, ...args));
  };
  run.cancel = (): void => {
    controller?.abort();
    controller = undefined;
  };
  return run;
}

// typeahead search where new runs or unmount abort pending request
export function SearchPage({ api }: { api: SearchApi }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserHit[]>([]);
  const search = useMemo(
    () => debounce((signal: AbortSignal, text: string) => api.search(text, signal), DEBOUNCE_MS),
    [api],
  );

  function doSearch(text: string) {
    if (!text.trim()) {
      search.cancel();
      setResults([]);
      return;
    }
    search(text).then(setResults, (error: { name?: string }) => {
      if (error.name !== 'AbortError' && error.name !== 'CanceledError') console.error(error);
    });
  }

  useEffect(() => () => search.cancel(), [search]);

  return (
    <div style={{ maxWidth: '32rem', margin: '2rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.3rem' }}>Cancelable user search</h1>
      <input
        aria-label="Search users"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          doSearch(event.target.value);
        }}
        placeholder="Type a name or email"
        style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', boxSizing: 'border-box' }}
      />
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {results.map((hit) => (
          <li
            key={hit.id}
            style={{ padding: '0.4rem 0', borderBottom: '1px solid #eee' }}
          >
            {hit.name} ({hit.email}), {hit.city} +{hit.cityCount}
          </li>
        ))}
      </ul>
    </div>
  );
}
