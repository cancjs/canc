import { type ReactNode } from 'react';

import { CancelableSuspense, useCancelableResource } from './lib/cancelable-suspense';
import type { TravelApi } from './mock/api';

// Correct pattern creating the resource above the boundary so CancelableSuspense owns its cleanup.
export function DetailPanel({ api, id }: { api: TravelApi; id: string }): ReactNode {
  const resource = useCancelableResource((getSignal) => api.destinationDetails(id, getSignal()), [api, id]);

  return (
    <CancelableSuspense
      resource={resource}
      fallback={<p style={{ color: '#aaa' }}>loading details…</p>}
    >
      {(details) => (
        <div
          data-testid={`details-${details.id}`}
          style={{ padding: '0.75rem', border: '1px solid #eee', borderRadius: 4 }}
        >
          <strong>{details.city}</strong> ({details.code})
          <div style={{ color: '#555', fontSize: '0.9rem', marginTop: '0.4rem' }}>
            gate {details.gate}, next departure {details.nextDeparture}
          </div>
        </div>
      )}
    </CancelableSuspense>
  );
}
