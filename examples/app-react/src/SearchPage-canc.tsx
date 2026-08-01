import { type ReactNode, useState } from 'react';

import { FlightRow } from './FlightRow-canc';
import { useCancelable } from './lib/use-cancelable';
import type { FlightApi } from './mock/api';

// Typeahead destination search. Every keystroke re-runs the search under a fresh cancelable chain;
// useCancelable cancels the previous run, so only the search for the current text ever completes
// (an aborted search shows up as an `aborted` marker in api.calls).
export function SearchPage({ api }: { api: FlightApi }): ReactNode {
  const [query, setQuery] = useState('');

  const results = useCancelable(
    (getSignal) => (query ? api.searchDestinations(query, getSignal()) : Promise.resolve([])),
    [api, query],
  );

  return (
    <div>
      <input
        aria-label="destination"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Where to?"
        style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', boxSizing: 'border-box' }}
      />
      <ul style={{ padding: 0, marginTop: '0.75rem' }}>
        {results.status === 'fulfilled' &&
          results.value?.map((destination) => (
            <FlightRow
              key={destination.id}
              api={api}
              destination={destination}
            />
          ))}
      </ul>
    </div>
  );
}
