import { type ReactNode, useState } from 'react';
import { cancelify } from '@cancjs/toolbox';

import { useCancelable } from './lib/use-cancelable';
import { useCancelableEffect } from './lib/use-cancelable-effect';
import type { FlightApi, FlightDestination } from './mock/api';

// One destination row. Hovering prefetches its details; unhovering (or unmounting) cancels that
// prefetch so an abandoned hover never finishes its request.
export function FlightRow({ api, destination }: { api: FlightApi; destination: FlightDestination }): ReactNode {
 const [hovering, setHovering] = useState(false);

 // Details prefetch has render state (the loading text and the result), so it uses useCancelable.
 const details = useCancelable(
 (getSignal) =>
 hovering ? api.flightDetails(destination.id, getSignal()) : Promise.resolve(undefined),
 [hovering, api, destination.id]
 );

 // Warm the cache as a side effect: fire-and-forget, nothing rendered from it. useCancelableEffect
 // earns its place here, where there is no settlement state to track, only a run to cancel on
 // unhover/unmount. Returning undefined for the not-hovering case is a no-op cleanup.
 useCancelableEffect(
 () => (hovering ? cancelify(({ getSignal }) => api.warmDetails(destination.id, getSignal()))() : undefined),
 [hovering, api, destination.id]
 );

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
