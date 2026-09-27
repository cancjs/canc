import { cancelify } from '@cancjs/toolbox';
import { type ReactNode, useState } from 'react';

import { useCancelable } from './lib/use-cancelable';
import { useCancelableEffect } from './lib/use-cancelable-effect';
import type { FlightApi, FlightDestination } from './mock/api';

const warmDetails = cancelify(({ getSignal }, api: FlightApi, id: string) => api.warmDetails(id, getSignal()));

// hovering prefetches details; unhovering or unmounting cancels the prefetch
export function FlightRow({ api, destination }: { api: FlightApi; destination: FlightDestination }): ReactNode {
  const [hovering, setHovering] = useState(false);

  // Details prefetch has render state (the loading text and the result), so it uses useCancelable.
  const details = useCancelable(
    (getSignal) => (hovering ? api.flightDetails(destination.id, getSignal()) : Promise.resolve(undefined)),
    [hovering, api, destination.id],
  );

  // warm cache as fire-and-forget side effect; cancel on unhover or unmount
  useCancelableEffect(() => (hovering ? warmDetails(api, destination.id) : undefined), [hovering, api, destination.id]);

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
        <span
          data-testid={`details-${destination.id}`}
          style={{ marginLeft: 8, color: '#333' }}
        >
          gate {details.value.gate}, next {details.value.nextDeparture}
        </span>
      )}
    </li>
  );
}
