import { type ReactNode } from 'react';

// shared chrome around mounted SearchPage; identical for both entries
export function App({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.25rem' }}>{title}</h1>
      <p style={{ color: '#555', fontSize: '0.9rem' }}>
        Type a destination and hover a result. Open the console to watch the mock API log which requests get aborted.
      </p>
      {children}
    </main>
  );
}
