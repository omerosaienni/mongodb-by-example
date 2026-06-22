import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Landmark } from '../collections.js';
import {
  INDEX_NAMES,
  ORIGIN,
  WITHIN_AREA,
  resetAndSeed,
  near,
  within,
  isAscending,
} from './geo.js';

async function landmarks(): Promise<Collection<Landmark>> {
  const db = await getDb();
  return db.collection<Landmark>(COLLECTIONS.landmarks);
}

// Build the known state once: every assertion is read-only so they share one
// seeded, indexed collection rather than rebuilding per test.
beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  const col = await landmarks();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('2dsphere index creation', () => {
  it('creates the 2dsphere index over location by name', async () => {
    const col = await landmarks();
    const all = await col.listIndexes().toArray();
    const geo = all.find((i) => i.name === INDEX_NAMES.location);
    expect(geo).toBeDefined();
    // A 2dsphere index records the field with the literal '2dsphere' key.
    expect(geo?.key).toEqual({ location: '2dsphere' });
  });
});

describe('a near query orders points by distance from the origin', () => {
  it('returns every landmark nearest first in the known sequence', async () => {
    const ranked = await near(ORIGIN);
    const names = ranked.map((r) => r.name);
    // The full ordered sequence has exactly one correct answer because the fixed
    // coordinates sit at strictly increasing distances. A wrong index, a [lon,lat]
    // swap or a query that ignored distance would reorder this.
    expect(names).toEqual([
      'Covent Garden',
      'British Museum',
      "St Paul's Cathedral",
      'Tower of London',
      'Greenwich Observatory',
    ]);
    // The computed distances must increase, confirming the order is by distance
    // and not insertion order.
    expect(isAscending(ranked.map((r) => r.distanceM))).toBe(true);
  });
});

describe('a within query returns only points inside the area', () => {
  it('includes a known-inside point and excludes a known-outside point', async () => {
    const inside = await within(WITHIN_AREA);
    // Covent Garden sits well within the radius.
    expect(inside).toContain('Covent Garden');
    // Greenwich sits beyond the radius so it must not appear.
    expect(inside).not.toContain('Greenwich Observatory');
  });
});
