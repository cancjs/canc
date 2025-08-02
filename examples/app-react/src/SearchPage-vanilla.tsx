import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { FlightRow } from './FlightRow-vanilla';
import type { FlightApi, FlightDestination } from './mock/api';

// A plain search. There is no cancelable chain to hand back; the caller threads an AbortController
// and a request id by hand instead (see the effect below) — the bloat this example is about.
function searchDestinations(api: FlightApi, query: string, signal: AbortSignal): Promise<FlightDestination[]> {
 return api.searchDestinations(query, signal);
}

// Typeahead destination search. Every keystroke starts a fresh search, but without a cancelable
// chain each one must be torn down by hand: an AbortController for the request, an isMounted ref
// for setState, and a request-id compare so a slow earlier response can't overwrite a newer one.
export function SearchPage({ api }: { api: FlightApi }): ReactNode {
 const [query, setQuery] = useState('');
 const [results, setResults] = useState<FlightDestination[]>([]);

 const requestId = useRef(0);
 const isMounted = useRef(true);
 useEffect(() => () => void (isMounted.current = false), []);

 useEffect(() => {
 if (!query) {
 setResults([]);
 return;
 }
 const controller = new AbortController();
 const id = ++requestId.current;

 searchDestinations(api, query, controller.signal)
 .then((found) => {
 // request-id compare: drop a stale response the user has already typed past.
 if (isMounted.current && id === requestId.current) setResults(found);
 })
 .catch((error) => {
 if (error?.name !== 'AbortError') throw error;
 });

 // AbortController.abort aborts THIS request when the query changes or on unmount.
 return () => controller.abort();
 }, [api, query]);

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
 {results.map((destination) => (
 <FlightRow key={destination.id} api={api} destination={destination} />
 ))}
 </ul>
 </div>
 );
}
