import { useEffect, useState } from 'react';
import { connectSse, type EventSourceFactory, type EventSourceLike } from './sseClient';
import type { Row } from './sseRows';

// The browser factory: the real EventSource opening the SSE endpoint. Adapted to
// EventSourceLike rather than handed over directly because the DOM EventSource
// types its onmessage as MessageEvent while the wrapper only needs `{ data }`;
// the adapter narrows the handler at the assignment so the wrapper stays
// DOM-independent and unit testable with a plain fake.
const browserFactory: EventSourceFactory = (url) => {
  const es = new EventSource(url);
  const adapter: EventSourceLike = {
    get onmessage() {
      return es.onmessage as ((event: { data: string }) => void) | null;
    },
    set onmessage(handler) {
      es.onmessage = handler as ((event: MessageEvent) => void) | null;
    },
    get onerror() {
      return es.onerror as ((event: unknown) => void) | null;
    },
    set onerror(handler) {
      es.onerror = handler as ((event: Event) => void) | null;
    },
    get readyState() {
      return es.readyState;
    },
    close: () => es.close(),
  };
  return adapter;
};

export interface UseSseRowsOptions {
  url: string;
  factory?: EventSourceFactory;
}

// Subscribe to the SSE stream and accumulate the derived rows newest first, so a
// new change appears at the top of the live table without a refresh. The client
// is opened once per mount and closed on unmount; reconnect across drops is the
// client's job, not the component's.
export function useSseRows(options: UseSseRowsOptions): Row[] {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const client = connectSse({
      url: options.url,
      factory: options.factory ?? browserFactory,
      onRow: (row) => setRows((prev) => [row, ...prev]),
    });
    return () => client.close();
  }, [options.url, options.factory]);

  return rows;
}
