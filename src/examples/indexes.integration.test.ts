import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Metric } from '../collections.js';
import {
  INDEX_NAMES,
  TTL_SECONDS,
  resetAndSeed,
  explainCategoryQuery,
  planUsesIndexScan,
  planUsesCollectionScan,
  activeScoresViaPartialIndex,
} from './indexes.js';

async function metrics(): Promise<Collection<Metric>> {
  const db = await getDb();
  return db.collection<Metric>(COLLECTIONS.metrics);
}

// Build the known state once: the index assertions are read-only so they share
// one seeded, indexed collection rather than rebuilding per test.
beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  const col = await metrics();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('index creation', () => {
  it('creates the compound index with the expected keys', async () => {
    const col = await metrics();
    const all = await col.listIndexes().toArray();
    const compound = all.find((i) => i.name === INDEX_NAMES.compound);
    expect(compound).toBeDefined();
    // category ascending then score descending, the order that serves the query.
    expect(compound?.key).toEqual({ category: 1, score: -1 });
  });

  it('creates the partial index with its partialFilterExpression', async () => {
    const col = await metrics();
    const all = await col.listIndexes().toArray();
    const partial = all.find((i) => i.name === INDEX_NAMES.partial);
    expect(partial).toBeDefined();
    expect(partial?.key).toEqual({ score: -1 });
    // The option that makes it partial must be recorded on the index.
    expect(partial?.partialFilterExpression).toEqual({ active: true });
  });

  it('creates the TTL index with expireAfterSeconds', async () => {
    const col = await metrics();
    const all = await col.listIndexes().toArray();
    const ttl = all.find((i) => i.name === INDEX_NAMES.ttl);
    expect(ttl).toBeDefined();
    expect(ttl?.key).toEqual({ expireAt: 1 });
    expect(ttl?.expireAfterSeconds).toBe(TTL_SECONDS);
  });
});

describe('explain proves the compound index is used', () => {
  it('the category-and-sort query wins with an IXSCAN, not a COLLSCAN', async () => {
    const explain = await explainCategoryQuery('cpu');
    expect(planUsesIndexScan(explain)).toBe(true);
    // Asserted explicitly: the gate is that the planner did NOT fall back to a
    // collection scan, which it would if the index were absent or ignored.
    expect(planUsesCollectionScan(explain)).toBe(false);
  });
});

describe('partial index excludes documents outside its filter', () => {
  it('does not index the inactive document, so a hinted read omits it', async () => {
    // The seed has three active documents (cpu 90, cpu 70, mem 80) and two
    // inactive (cpu 50, mem 30). Reading through the partial index returns only
    // the active scores, proving the inactive documents were never indexed.
    const scores = await activeScoresViaPartialIndex();
    expect(scores).toEqual([90, 80, 70]);
    // The inactive cpu document scoring 50 must be absent from the partial index.
    expect(scores).not.toContain(50);
    expect(scores).not.toContain(30);
  });
});
