import { messageDataToRow, type Row } from './sseRows';

// The slice of the EventSource API this wrapper depends on. Declared as an
// interface, not the global EventSource, so a fake can be injected in the unit
// test without a real network connection or jsdom's EventSource. readyState and
// CLOSED let the reconnect guard tell a dropped connection from a transient
// error the browser is already retrying itself.
export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readyState: number;
  close: () => void;
}

// A factory the wrapper calls to open a connection. The browser passes the real
// `(url) => new EventSource(url)`; the test passes one returning a fake. Each
// call must yield a fresh connection so a reconnect is observable as a new one.
export type EventSourceFactory = (url: string) => EventSourceLike;

// EventSource.CLOSED is 2 in the DOM spec. Hardcoded so the wrapper does not
// depend on the global being present (the test runs with a fake, no real
// EventSource), keeping the reconnect logic checkable without a browser.
const EVENT_SOURCE_CLOSED = 2;

export interface SseClientOptions {
  url: string;
  factory: EventSourceFactory;
  onRow: (row: Row) => void;
  // Delay before reopening after a drop. Guards against a tight reconnect loop
  // when the server is down: without it onerror would re-open synchronously and
  // spin. The test passes 0 with a fake timer to keep assertions deterministic.
  reconnectDelayMs?: number;
  // Injected so the test can drive reconnection without real wall-clock waits.
  // Defaults to the global setTimeout in the browser.
  setTimeoutFn?: (fn: () => void, ms: number) => void;
}

export interface SseClient {
  // The current underlying connection, exposed so a test can fire its handlers
  // and assert a reconnect replaced it. Read fresh after a drop, not cached.
  current: () => EventSourceLike;
  close: () => void;
}

// Open an SSE connection and keep it open across drops. Native EventSource
// retries on its own, but the criterion wants reconnect to be a real property of
// this wiring, so the wrapper owns it explicitly: on error, if the connection has
// actually closed, schedule a fresh one through the same factory. A connection
// the browser is still retrying (readyState not CLOSED) is left alone to avoid
// racing two live connections.
export function connectSse(options: SseClientOptions): SseClient {
  const { url, factory, onRow } = options;
  const reconnectDelayMs = options.reconnectDelayMs ?? 1000;
  const schedule =
    options.setTimeoutFn ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms));

  let source: EventSourceLike;
  let closed = false;

  const open = (): void => {
    source = factory(url);
    source.onmessage = (event) => {
      onRow(messageDataToRow(event.data));
    };
    source.onerror = () => {
      if (closed) {
        return;
      }
      // Only reconnect on a real drop. EventSource sets readyState to CLOSED when
      // it has given up; while it is still CONNECTING it is retrying itself and a
      // second connection here would duplicate the stream.
      if (source.readyState === EVENT_SOURCE_CLOSED) {
        source.close();
        schedule(() => {
          if (!closed) {
            open();
          }
        }, reconnectDelayMs);
      }
    };
  };

  open();

  return {
    current: () => source,
    close: () => {
      closed = true;
      source.close();
    },
  };
}
