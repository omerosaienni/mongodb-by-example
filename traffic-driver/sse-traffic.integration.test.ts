import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../src/db.js';
import { COLLECTIONS, type EventDoc } from '../src/collections.js';
import { establish } from '../src/examples/change-streams.js';
import { resetTraffic, performOne } from './sse-traffic.js';

// Integration tier: a real change stream on a real collection. Proves the driver's
// writes are genuine Mongo operations a change stream observes, the same wiring
// the SSE server relies on. The driver targets sseEvents in production, but this
// test drives COLLECTIONS.sseTraffic so it never drops or watches sseEvents
// concurrently with the SSE server's own integration test under the parallel file
// runner, which would invalidate that test's open stream.

async function traffic(): Promise<Collection<EventDoc>> {
  const db = await getDb();
  return db.collection<EventDoc>(COLLECTIONS.sseTraffic);
}

// Reset before each test so every case opens its watch on an empty collection and
// the driver's key pool and ordinal start clean, never seeing another test's writes.
beforeEach(async () => {
  await resetTraffic(COLLECTIONS.sseTraffic);
});

afterAll(async () => {
  const col = await traffic();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('the traffic driver writes events a change stream observes', () => {
  it('delivers the operations performOne issues, in order, to a watcher', async () => {
    const col = await traffic();
    // Open the watch before any write: a change stream only delivers events that
    // occur after it opens, so writing first would lose them.
    const stream = col.watch<EventDoc>();
    try {
      // Pin the stream start before writing or the events fall outside its window:
      // watch() is lazy until the first round trip, which establish forces.
      await establish(stream);

      // From an empty collection the first three operations are inserts: the live
      // pool starts empty, so each early roll falls back to insert. Capturing the
      // ops the driver reports lets the assertion stay independent of the mix.
      const ops: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        ops.push(await performOne(col));
      }

      const observed: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const event = await stream.next();
        observed.push(event.operationType);
        // An insert event carries the document the driver wrote, keyed as expected.
        // A driver that wrote nothing, or to another collection, would hang here.
        if (event.operationType === 'insert') {
          expect(event.fullDocument.key).toMatch(/^user_[0-9a-f]{4}$/);
        }
      }

      expect(observed).toEqual(ops);
    } finally {
      await stream.close();
    }
  });
});
