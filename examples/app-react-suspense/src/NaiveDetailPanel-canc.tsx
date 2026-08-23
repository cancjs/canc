import { type ReactNode, Suspense } from 'react';

import { useCancelableSuspense } from './lib/use-cancelable-suspense';
import type { TravelApi } from './mock/api';

// A leaking anti-pattern creating a CancelablePromise whose cleanup effect never runs.
function NaiveReader({ api, id }: { api: TravelApi; id: string }): ReactNode {
  const details = useCancelableSuspense((getSignal) => api.destinationDetails(id, getSignal()), [api, id]);
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

export function NaiveDetailPanel({ api, id }: { api: TravelApi; id: string }): ReactNode {
  return (
    <Suspense fallback={<p style={{ color: '#aaa' }}>loading details…</p>}>
      <NaiveReader
        api={api}
        id={id}
      />
    </Suspense>
  );
}
