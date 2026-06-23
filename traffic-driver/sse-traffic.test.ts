import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Collection } from 'mongodb';
import { performOne, startTraffic, resetState, DEFAULT_INTERVAL_MS } from './sse-traffic.js';
import type { EventDoc } from '../src/collections.js';

// Unit tier: no Mongo. A fake collection records the operations the driver issues
// so the operation-mix logic and the loop wiring are provable with the database
// down. The integration tier (sse-traffic.integration.test.ts) proves a real
// write reaches a real change stream.

// A minimal stand-in for the driver methods on a Collection, recording calls.
function fakeCollection(): {
  col: Collection<EventDoc>;
  inserts: EventDoc[];
  updates: { key: string }[];
  deletes: { key: string }[];
} {
  const inserts: EventDoc[] = [];
  const updates: { key: string }[] = [];
  const deletes: { key: string }[] = [];
  const col = {
    insertOne: async (doc: EventDoc) => {
      inserts.push(doc);
      return { acknowledged: true };
    },
    updateOne: async (filter: { key: string }) => {
      updates.push(filter);
      return { acknowledged: true };
    },
    deleteOne: async (filter: { key: string }) => {
      deletes.push(filter);
      return { acknowledged: true };
    },
  } as unknown as Collection<EventDoc>;
  return { col, inserts, updates, deletes };
}

beforeEach(() => {
  // performOne reads module-level faker state, the liveKeys pool and the ordinal.
  // resetState clears all three and reseeds faker, isolating each test from the
  // previous one's writes; the first operation is then always an insert because
  // the live pool is empty.
  resetState();
});

describe('performOne', () => {
  it('always inserts first, because nothing is live to update or delete', async () => {
    const { col, inserts } = fakeCollection();
    const op = await performOne(col);
    expect(op).toBe('insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].key).toMatch(/^user_[0-9a-f]{4}$/);
  });

  it('only ever targets a real live key on update and delete', async () => {
    const { col, inserts, updates, deletes } = fakeCollection();
    const ops: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      ops.push(await performOne(col));
    }
    const insertedKeys = new Set(inserts.map((d) => d.key));
    for (const u of updates) {
      expect(insertedKeys.has(u.key)).toBe(true);
    }
    for (const d of deletes) {
      expect(insertedKeys.has(d.key)).toBe(true);
    }
    // The mix exercises all three operations over a run of this length.
    expect(ops).toContain('insert');
    expect(ops).toContain('update');
    expect(ops).toContain('delete');
  });

  it('never deletes the same key twice without a re-insert', async () => {
    const { col, deletes } = fakeCollection();
    for (let i = 0; i < 50; i += 1) {
      await performOne(col);
    }
    const deletedKeys = deletes.map((d) => d.key);
    expect(new Set(deletedKeys).size).toBe(deletedKeys.length);
  });
});

describe('startTraffic', () => {
  it('performs one operation per interval tick and stops cleanly', async () => {
    const { col } = fakeCollection();
    // Returns a fixed handle the stop() path then passes to clearIntervalFn. The
    // registered tick callback is read back from the recorded call, not captured
    // in a closure, so the mock body needs no reference to its argument.
    const fakeSetInterval = vi
      .fn<(fn: () => void, ms: number) => ReturnType<typeof setInterval>>()
      .mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    const fakeClearInterval = vi.fn();
    const seen: string[] = [];

    const driver = startTraffic(col, {
      setIntervalFn: fakeSetInterval,
      clearIntervalFn: fakeClearInterval,
      onTick: (op) => seen.push(op),
    });

    expect(fakeSetInterval).toHaveBeenCalledWith(expect.any(Function), DEFAULT_INTERVAL_MS);

    // The tick callback startTraffic registered, recovered from the recorded call.
    const tick = fakeSetInterval.mock.calls[0][0];

    // Drain the microtask queue so a tick's performOne and its busy-flag reset in
    // the .finally both settle before the next tick fires.
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
    };

    // Fire three well-spaced ticks; each completes before the next, so all three
    // perform an operation.
    for (let i = 0; i < 3; i += 1) {
      tick();
      await flush();
    }
    expect(seen.length).toBe(3);

    driver.stop();
    expect(fakeClearInterval).toHaveBeenCalledWith(1);
  });

  it('skips a tick that fires while the previous operation is still in flight', async () => {
    const { col, inserts } = fakeCollection();
    const fakeSetInterval = vi
      .fn<(fn: () => void, ms: number) => ReturnType<typeof setInterval>>()
      .mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);

    startTraffic(col, {
      setIntervalFn: fakeSetInterval,
      clearIntervalFn: vi.fn(),
    });
    const tick = fakeSetInterval.mock.calls[0][0];

    // Two ticks back to back with no await between them: the first sets busy and
    // its write is in flight, so the second must be skipped. Only one write lands.
    tick();
    tick();
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
    expect(inserts).toHaveLength(1);
  });
});
