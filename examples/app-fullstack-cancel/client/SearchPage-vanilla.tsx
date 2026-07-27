import { useEffect, useMemo, useRef, useState } from 'react';
import type { SearchApi } from './api-vanilla';
import type { UserHit } from './user-hit';

const DEBOUNCE_MS = 250;

// A plain debounce: a timer that resets on each call. It cancels the pending wait only; the in-flight
// request is aborted separately through the AbortController below. Kept local, not shared, because it
// is the hand-rolled counterpart to the canc debounce (which cancels the wait and the request as one).
function debounce<Args extends unknown[]>(ms: number, fn: (...args: Args) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = (...args: Args): void => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  run.cancel = (): void => clearTimeout(timer);
  return run;
}

// Typeahead user search, hand-rolled. Typing is debounced, each keystroke aborts the previous request
// through an AbortController, and a request id guards against a slow response overwriting a newer one.
// An aborted request is ignored. The pending work is cleaned up on unmount.
export function SearchPage({ api }: { api: SearchApi }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserHit[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const search = useMemo(
    () =>
      debounce(DEBOUNCE_MS, (text: string) => {
        const controller = new AbortController();
        controllerRef.current = controller;
        const requestId = ++requestIdRef.current;
        api.search(text, controller.signal).then(
          (hits) => {
            if (requestId === requestIdRef.current) setResults(hits);
          },
          (error: { name?: string }) => {
            if (error.name !== 'CanceledError' && error.name !== 'AbortError') console.error(error);
          },
        );
      }),
    [api],
  );

  function doSearch(text: string) {
    controllerRef.current?.abort();
    if (!text.trim()) {
      search.cancel();
      setResults([]);
      return;
    }
    search(text);
  }

  useEffect(
    () => () => {
      search.cancel();
      controllerRef.current?.abort();
    },
    [search],
  );

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
          <li key={hit.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid #eee' }}>
            {hit.name} ({hit.email}), {hit.city} +{hit.cityCount}
          </li>
        ))}
      </ul>
    </div>
  );
}
