import { type ReactNode, useMemo, useState } from 'react';
import { cancelify } from '@cancjs/toolbox';

import { useCancelableEffect } from './lib/use-cancelable-effect';
import { usePromiseState } from './lib/use-promise-state';
import { FlightRow } from './FlightRow-canc';
import type { FlightApi, FlightDestination } from './mock/api';

// A cancelable destination search. cancelify hands the fn an outbound signal that aborts when the
// returned promise is canceled (an aborted search shows up as an `aborted` marker in api.calls).
function searchDestinations(api: FlightApi, query: string) {
 return cancelify((getSignal, [q]: [string]) => api.searchDestinations(q, getSignal()))(query);
}

// Typeahead destination search. Every keystroke starts a fresh search chain; the effect cleanup
// cancels the previous one, so only the search for the current text ever completes.
export function SearchPage({ api }: { api: FlightApi }): ReactNode {
 const [query, setQuery] = useState('');

 const search = useMemo(() => (query ? searchDestinations(api, query) : undefined), [api, query]);

 useCancelableEffect(() => {
 if (!search) return;
 // Superseded searches are canceled (the hook suppresses that CancelError itself).
 return search;
 }, [search]);

 const results = usePromiseState(search);

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
 <FlightRow key={destination.id} api={api} destination={destination} />
 ))}
 </ul>
 </div>
 );
}
