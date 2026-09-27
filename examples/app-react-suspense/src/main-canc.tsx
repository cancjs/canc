import '@cancjs/unhandled-rejection/register';

import { type ReactNode, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { App, DestinationPicker } from './app';
import { DetailPanel } from './DetailPanel-canc';
import { createTravelApi, type Destination } from './mock/api';

const api = createTravelApi({ trace: (line) => console.log(line) });

// static destinations; selecting a new destination supersedes the previous one
const DESTINATIONS: Destination[] = [
  { id: 'jfk', city: 'New York', code: 'JFK' },
  { id: 'lax', city: 'Los Angeles', code: 'LAX' },
  { id: 'lhr', city: 'London', code: 'LHR' },
  { id: 'lis', city: 'Lisbon', code: 'LIS' },
  { id: 'nrt', city: 'Tokyo', code: 'NRT' },
];

function Page(): ReactNode {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <DestinationPicker
        destinations={DESTINATIONS}
        selected={selected}
        onSelect={setSelected}
      />
      {selected && (
        <DetailPanel
          api={api}
          id={selected}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App title="Suspense details (canc)">
      <Page />
    </App>
  </StrictMode>,
);
