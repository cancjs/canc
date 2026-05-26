import { type ReactNode, useMemo, useState } from 'react';
import { cancelify } from '@cancjs/toolbox';

import { useCancelableEffect } from './lib/use-cancelable-effect';
import { usePromiseState } from './lib/use-promise-state';
import type { FlightApi, FlightDestination, FlightDetails } from './mock/api';

// A cancelable details prefetch. cancelify hands the fn an outbound signal that aborts when the
// returned promise is canceled.
function prefetchDetails(api: FlightApi, id: string) {
 return cancelify((getSignal, [flightId]: [string]) => api.flightDetails(flightId, getSignal()))(id);
}

// One destination row. Hovering prefetches its details; unhovering (or unmounting) cancels that
// prefetch so an abandoned hover never finishes its request.
export function FlightRow({ api, destination }: { api: FlightApi; destination: FlightDestination }): ReactNode {
 const [hovering, setHovering] = useState(false);

 const prefetch = useMemo(
 () => (hovering ? prefetchDetails(api, destination.id) : undefined),
 [hovering, api, destination.id]
 );

 // A canceled prefetch is expected (the user unhovered); the hook suppresses its CancelError.
 useCancelableEffect(() => prefetch, [prefetch]);

 const details = usePromiseState(prefetch);

 return (
 <li
 data-testid={`row-${destination.id}`}
 onMouseEnter={() => setHovering(true)}
 onMouseLeave={() => setHovering(false)}
 style={{ padding: '0.4rem 0', borderBottom: '1px solid #eee', listStyle: 'none' }}
 >
 <strong>{destination.city}</strong> <span style={{ color: '#888' }}>({destination.code})</span>
 {details.status === 'pending' && <span style={{ marginLeft: 8, color: '#aaa' }}>loading…</span>}
 {details.status === 'fulfilled' && details.value && (
 <span data-testid={`details-${destination.id}`} style={{ marginLeft: 8, color: '#333' }}>
 gate {details.value.gate}, next {details.value.nextDeparture}
 </span>
 )}
 </li>
 );
}
