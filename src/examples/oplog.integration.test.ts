import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Counter } from '../collections.js';
import {
  COUNTER_NAME,
  START_VALUE,
  INCREMENT,
  resetAndSeed,
  incrementCounter,
  latestUpdateEntry,
  deltaContainsInc,
  extractUpdatedValue,
} from './oplog.js';

async function counters(): Promise<Collection<Counter>> {
  const db = await getDb();
  return db.collection<Counter>(COLLECTIONS.counters);
}

// Reseed before each test so every case starts from the same known counter and
// never inherits another test's increment.
beforeEach(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  const col = await counters();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('the oplog logs an $inc as its resolved absolute value', () => {
  it('records the resulting total under the $v:2 diff, not the relative instruction', async () => {
    const id = await incrementCounter(COUNTER_NAME, INCREMENT);
    const entry = await latestUpdateEntry(id);

    expect(entry).not.toBeNull();
    if (entry === null) return;

    // The entry is for our exact document and update.
    expect(entry.op).toBe('u');
    expect(entry.o2?._id).toStrictEqual(id);

    // The delta carries the ABSOLUTE resulting value, start + increment, the
    // idempotent form. A relative instruction would carry the increment (3), not
    // the total (8), so this fails if the entry stored the instruction.
    expect(extractUpdatedValue(entry.o, 'counter')).toBe(START_VALUE + INCREMENT);

    // And no $inc operator appears anywhere in the logged op: replaying it sets
    // the same end state regardless of the document's prior value.
    expect(deltaContainsInc(entry.o)).toBe(false);
    expect(JSON.stringify(entry.o)).not.toContain('$inc');
  });

  it('logs a second increment as the new running total, again absolute', async () => {
    await incrementCounter(COUNTER_NAME, INCREMENT);
    const id = await incrementCounter(COUNTER_NAME, INCREMENT);
    const entry = await latestUpdateEntry(id);

    expect(entry).not.toBeNull();
    if (entry === null) return;

    // Two increments from the start: the latest entry carries the cumulative
    // absolute value, proving each entry logs the resolved total not the delta.
    expect(extractUpdatedValue(entry.o, 'counter')).toBe(START_VALUE + INCREMENT * 2);
    expect(deltaContainsInc(entry.o)).toBe(false);
  });
});
