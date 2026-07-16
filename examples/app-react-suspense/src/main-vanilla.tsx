import { StrictMode, type ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { App, DestinationPicker } from './app';
import { DetailPanel } from './DetailPanel-vanilla';
import { createTravelApi, type Destination } from './mock/api';

const api = createTravelApi({ trace: (line) => console.log(line) });

// A short static list stands in for the picker source, so the story stays on the details load that
// suspends. Selecting another destination unmounts the reader mid-load, but the plain Promise it
// suspended on keeps running to completion (no way to cancel it).
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
 <DestinationPicker destinations={DESTINATIONS} selected={selected} onSelect={setSelected} />
 {selected && <DetailPanel api={api} id={selected} />}
 </>
 );
}

createRoot(document.getElementById('root')!).render(
 <StrictMode>
 <App title="Suspense details (vanilla)">
 <Page />
 </App>
 </StrictMode>
);
