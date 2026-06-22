import { describe, it, expect, vi } from 'vitest';
import { connectSse, type EventSourceLike, type EventSourceFactory } from './sseClient';
import type { Row } from './sseRows';

// A controllable fake standing in for EventSource so the reconnect property is
// tested deterministically, with no real network or timing. Each construction is
// recorded so the test can assert a drop produced a brand new connection.
class FakeEventSource implements EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readyState = 0;
  closed = false;
  close(): void {
    this.closed = true;
  }
  // Simulate the browser giving up on the socket: it flips to CLOSED then fires
  // onerror, which is exactly the drop the wrapper must recover from.
  drop(): void {
    this.readyState = 2;
    this.onerror?.(new Event('error'));
  }
}

function makeHarness() {
  const created: FakeEventSource[] = [];
  const factory: EventSourceFactory = () => {
    const es = new FakeEventSource();
    created.push(es);
    return es;
  };
  return { created, factory };
}

describe('connectSse reconnect', () => {
  it('opens a new connection through the factory after a drop', () => {
    const { created, factory } = makeHarness();
    // reconnectDelayMs 0 with a synchronous timer keeps the test deterministic.
    const client = connectSse({
      url: '/events',
      factory,
      onRow: () => {},
      reconnectDelayMs: 0,
      setTimeoutFn: (fn) => fn(),
    });

    expect(created).toHaveLength(1);
    const first = created[0];

    first.drop();

    // A drop must establish a second, distinct connection: this is the reconnect.
    expect(created).toHaveLength(2);
    expect(client.current()).toBe(created[1]);
    expect(client.current()).not.toBe(first);
    expect(first.closed).toBe(true);
  });

  it('reconnects repeatedly across successive drops', () => {
    const { created, factory } = makeHarness();
    connectSse({
      url: '/events',
      factory,
      onRow: () => {},
      reconnectDelayMs: 0,
      setTimeoutFn: (fn) => fn(),
    });

    created[0].drop();
    created[1].drop();
    expect(created).toHaveLength(3);
  });

  it('does not reconnect while EventSource is still retrying (not CLOSED)', () => {
    const { created, factory } = makeHarness();
    connectSse({
      url: '/events',
      factory,
      onRow: () => {},
      reconnectDelayMs: 0,
      setTimeoutFn: (fn) => fn(),
    });

    // readyState left at CONNECTING (0): the browser is still retrying, so the
    // wrapper must not open a competing second connection.
    created[0].onerror?.(new Event('error'));
    expect(created).toHaveLength(1);
  });

  it('does not reconnect after close()', () => {
    const { created, factory } = makeHarness();
    const client = connectSse({
      url: '/events',
      factory,
      onRow: () => {},
      reconnectDelayMs: 0,
      setTimeoutFn: (fn) => fn(),
    });

    client.close();
    created[0].drop();
    expect(created).toHaveLength(1);
  });

  it('respects the reconnect delay before reopening', () => {
    const { created, factory } = makeHarness();
    const schedule = vi.fn<(fn: () => void, ms: number) => void>();
    connectSse({
      url: '/events',
      factory,
      onRow: () => {},
      reconnectDelayMs: 1000,
      setTimeoutFn: schedule,
    });

    created[0].drop();
    // The reopen is deferred through the timer, not fired inline, so the tight
    // reconnect loop guard is exercised: still one connection until the timer runs.
    expect(created).toHaveLength(1);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 1000);
    schedule.mock.calls[0][0]();
    expect(created).toHaveLength(2);
  });

  it('delivers parsed rows from incoming messages', () => {
    const { created, factory } = makeHarness();
    const rows: Row[] = [];
    connectSse({
      url: '/events',
      factory,
      onRow: (row) => rows.push(row),
      reconnectDelayMs: 0,
      setTimeoutFn: (fn) => fn(),
    });

    created[0].onmessage?.({
      data: JSON.stringify({
        operationType: 'insert',
        documentKey: { _id: 'abc' },
        fullDocument: { _id: 'abc', key: 'k-1', label: 'first' },
      }),
    });

    expect(rows).toEqual<Row[]>([
      { id: 'k-1', operationType: 'insert', key: 'k-1', label: 'first' },
    ]);
  });
});
