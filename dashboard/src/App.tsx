import type { JSX } from 'react';
import { ChangesTable } from './ChangesTable';
import { useSseRows } from './useSseRows';

// The SSE endpoint. In dev, Vite proxies /events to the SSE server (vite.config.ts)
// so the browser and the server agree on the path from deliverable 16 without a
// hardcoded host.
const SSE_URL = '/events';

export function App(): JSX.Element {
  const rows = useSseRows({ url: SSE_URL });
  return (
    <main className="shell">
      <div className="header">
        <h1>Live change stream</h1>
        <span className="count">
          {rows.length} {rows.length === 1 ? 'event' : 'events'}
        </span>
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <p className="empty">Waiting for changes...</p>
        ) : (
          <ChangesTable rows={rows} />
        )}
      </div>
    </main>
  );
}
