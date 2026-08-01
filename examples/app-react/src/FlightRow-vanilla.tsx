import { type ReactNode, useEffect, useState } from 'react';

import type { FlightApi, FlightDestination, FlightDetails } from './mock/api';

// A plain details fetch. No cancelation: once hover starts it, nothing can stop it (see the effect).
function prefetchDetails(api: FlightApi, id: string): Promise<FlightDetails> {
  return api.flightDetails(id);
}

// One destination row. Hovering prefetches its details, but there is nothing to cancel: unhovering
// or unmounting cannot stop the request, so it completes and tries to set state anyway.
export function FlightRow({ api, destination }: { api: FlightApi; destination: FlightDestination }): ReactNode {
  const [hovering, setHovering] = useState(false);

  const [details, setDetails] = useState<FlightDetails>();

  useEffect(() => {
    if (!hovering) return;
    prefetchDetails(api, destination.id).then((value) => {
      // state update for a hover the user already left — the request completed anyway.
      setDetails(value);
    });
    // (no cancellation counterpart — the fetch keeps running after unhover/unmount)
  }, [hovering, api, destination.id]);

  return (
    <li
      data-testid={`row-${destination.id}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ padding: '0.4rem 0', borderBottom: '1px solid #eee', listStyle: 'none' }}
    >
      <strong>{destination.city}</strong> <span style={{ color: '#888' }}>({destination.code})</span>
      {hovering && !details && <span style={{ marginLeft: 8, color: '#aaa' }}>loading…</span>}
      {details && (
        <span
          data-testid={`details-${destination.id}`}
          style={{ marginLeft: 8, color: '#333' }}
        >
          gate {details.gate}, next {details.nextDeparture}
        </span>
      )}
    </li>
  );
}
