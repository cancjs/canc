import { useEffect, useRef, useState } from 'react';
import { isCancelError, type CancelablePromise } from '@cancjs/promise';
import type { SearchApi } from './api-canc';
import type { UserHit } from './user-hit';

// Typeahead user search. Each keystroke starts a new search and cancels the previous one, so a stale
// response can never overwrite a newer result. A canceled search is treated as nothing happened, not
// an error. The pending search is also canceled on unmount.
export function SearchPage({ api }: { api: SearchApi }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserHit[]>([]);
  const searchRef = useRef<CancelablePromise<UserHit[]> | null>(null);

  function doSearch(text: string) {
    searchRef.current?.cancel();
    if (!text.trim()) {
      setResults([]);
      return;
    }
    const task = api.search(text);
    searchRef.current = task;
    task.then(setResults, (error) => {
      if (!isCancelError(error)) console.error(error);
    });
  }

  useEffect(() => () => void searchRef.current?.cancel(), []);

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
