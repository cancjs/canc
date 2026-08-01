import { isCancelError } from '@cancjs/promise';
import { debounce } from '@cancjs/toolbox';
import { useEffect, useMemo, useState } from 'react';

import type { SearchApi } from './api-canc';
import type { UserHit } from './user-hit';

const DEBOUNCE_MS = 250;

// Typeahead user search. Typing runs a debounced search, and each run cancels the previous one (its
// pending wait, or its in-flight request), so a stale response can never overwrite a newer result. A
// canceled search is treated as nothing happened, not an error. The pending search is canceled on unmount.
export function SearchPage({ api }: { api: SearchApi }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserHit[]>([]);
  const search = useMemo(() => debounce((text: string) => api.search(text), DEBOUNCE_MS), [api]);

  function doSearch(text: string) {
    if (!text.trim()) {
      search.cancel();
      setResults([]);
      return;
    }
    search(text).then(setResults, (error: unknown) => {
      if (!isCancelError(error)) console.error(error);
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
