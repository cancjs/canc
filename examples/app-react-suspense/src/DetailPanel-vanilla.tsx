import { type ReactNode, Suspense, use, useMemo } from 'react';

import type { TravelApi } from './mock/api';

// The request is a plain Promise without cancellation so nothing can stop it.
function DetailReader({ api, id }: { api: TravelApi; id: string }): ReactNode {
  const detailsPromise = useMemo(() => api.destinationDetails(id), [api, id]);
  const details = use(detailsPromise);
  return (
    <div
      data-testid={`details-${details.id}`}
      style={{ padding: '0.75rem', border: '1px solid #eee', borderRadius: 4 }}
    >
      <strong>{details.city}</strong> ({details.code})
      <div style={{ color: '#555', fontSize: '0.9rem', marginTop: '0.4rem' }}>
        gate {details.gate}, next departure {details.nextDeparture}
      </div>
    </div>
  );
}

// Plain Suspense boundary leaves unmounted requests running in the background.
export function DetailPanel({ api, id }: { api: TravelApi; id: string }): ReactNode {
  return (
    <Suspense fallback={<p style={{ color: '#aaa' }}>loading details…</p>}>
      <DetailReader
        api={api}
        id={id}
      />
    </Suspense>
  );
}
