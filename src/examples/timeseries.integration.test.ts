import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Reading } from '../collections.js';
import {
  TIME_FIELD,
  META_FIELD,
  WINDOW_START,
  WINDOW_END,
  EXPECTED_WINDOW_VALUES,
  resetAndSeed,
  collectionTimeseries,
  readingsInWindow,
} from './timeseries.js';

async function readings(): Promise<Collection<Reading>> {
  const db = await getDb();
  return db.collection<Reading>(COLLECTIONS.readings);
}

// Build the known state once: every assertion is read-only so they share one
// seeded collection rather than recreating it per test.
beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  const col = await readings();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('the collection is created as a time series collection', () => {
  it('reports timeseries options with the expected timeField in its metadata', async () => {
    const db = await getDb();
    const ts = await collectionTimeseries(db);
    // An ordinary collection has no timeseries options, so this is undefined and
    // the test fails if resetAndSeed created a plain collection rather than a time
    // series one.
    expect(ts).toBeDefined();
    expect(ts?.timeField).toBe(TIME_FIELD);
    expect(ts?.metaField).toBe(META_FIELD);
  });
});

describe('a time-window query returns only readings inside the window', () => {
  it('includes every in-window reading and excludes those before start and on end', async () => {
    const inWindow = await readingsInWindow(WINDOW_START, WINDOW_END);
    const values = inWindow.map((r) => r.value);
    // The exact ordered set of in-window values. The two readings before start
    // (10, 11) and the one exactly on end (15) are absent, so a wrong lower bound,
    // a wrong upper bound or an inclusive $lte would change this and fail.
    expect(values).toEqual([...EXPECTED_WINDOW_VALUES]);

    // Every returned timestamp genuinely sits in the half-open window, proving the
    // exclusions above are not a coincidence of the value list.
    for (const r of inWindow) {
      expect(r.timestamp.getTime()).toBeGreaterThanOrEqual(WINDOW_START.getTime());
      expect(r.timestamp.getTime()).toBeLessThan(WINDOW_END.getTime());
    }
  });
});
