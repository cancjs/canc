import { type ReactNode } from 'react';

// Shared chrome around whichever detail panel flavor is mounted. Suffix-free: identical for both
// entries, so it carries no cancellation logic of its own.
export function App({ title, children }: { title: string; children: ReactNode }): ReactNode {
 return (
 <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
 <h1 style={{ fontSize: '1.25rem' }}>{title}</h1>
 <p style={{ color: '#555', fontSize: '0.9rem' }}>
 Pick a destination to load its details under Suspense, then pick another before it finishes.
 Open the console to watch the mock API log which detail requests get aborted.
 </p>
 {children}
 </main>
 );
}

// Shared picker chrome. The list itself never suspends; selecting a destination is what starts a
// suspending details load in the flavored panel below.
export function DestinationPicker({
 destinations,
 selected,
 onSelect,
}: {
 destinations: { id: string; city: string; code: string }[];
 selected: string | null;
 onSelect: (id: string) => void;
}): ReactNode {
 return (
 <ul style={{ padding: 0, margin: '0 0 1rem', listStyle: 'none', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
 {destinations.map((destination) => (
 <li key={destination.id}>
 <button
 data-testid={`pick-${destination.id}`}
 onClick={() => onSelect(destination.id)}
 style={{
 padding: '0.4rem 0.7rem',
 border: '1px solid #ccc',
 borderRadius: 4,
 background: selected === destination.id ? '#e8f0fe' : '#fff',
 cursor: 'pointer',
 }}
 >
 {destination.city} ({destination.code})
 </button>
 </li>
 ))}
 </ul>
 );
}
