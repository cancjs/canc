import { type ReactNode, Suspense, use, useMemo } from 'react';

import type { TravelApi } from './mock/api';

// (no cancellation counterpart — see -canc) The request is a plain Promise. React.use suspends on
// it, but a plain Promise has no cancel, so nothing here can stop it.
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

// Plain Suspense boundary. It shows the fallback, but there is no abandon hook: picking another
// destination unmounts the reader while its request is still running, and that request completes in
// the background anyway (a completed marker with no aborted marker in the call log).
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
