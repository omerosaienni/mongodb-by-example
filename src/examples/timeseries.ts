import type { Collection, Db } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Reading } from '../collections.js';

// The fields the collection is created on. timeField is mandatory for a time
// series collection, metaField and granularity are optional but stated here so
// the metadata assertion and the bucketing behaviour are both explicit and fixed.
export const TIME_FIELD = 'timestamp';
export const META_FIELD = 'sensorId';

// The window the query ranges over, half open [start, end). Fixed so the
// assertion fails if the bounds are wrong. The readings below straddle it: two
// fall before start, three fall inside, one falls on end and so is excluded by
// the half-open upper bound, proving the boundary is exclusive not inclusive.
export const WINDOW_START = new Date('2024-01-01T01:00:00.000Z');
export const WINDOW_END = new Date('2024-01-01T04:00:00.000Z');

// Deterministic readings the demo and tests share, all from one sensor so the
// window query is the only thing that selects between them. Fixed timestamps so
// each is unambiguously inside or outside the window: 00:00 and 00:30 before
// start, 01:00, 02:00 and 03:00 inside, 04:00 exactly on end and excluded.
export function sampleReadings(): Reading[] {
  const at = (iso: string, value: number): Reading => ({
    timestamp: new Date(iso),
    sensorId: 'sensor-1',
    value,
  });
  return [
    at('2024-01-01T00:00:00.000Z', 10),
    at('2024-01-01T00:30:00.000Z', 11),
    at('2024-01-01T01:00:00.000Z', 12),
    at('2024-01-01T02:00:00.000Z', 13),
    at('2024-01-01T03:00:00.000Z', 14),
    at('2024-01-01T04:00:00.000Z', 15),
  ];
}

// The values the window query must return, in timestamp order, derived from the
// fixed readings above. Exported so the test names the exact expected result a
// wrong bound would not produce.
export const EXPECTED_WINDOW_VALUES = [12, 13, 14] as const;

async function readings(): Promise<Collection<Reading>> {
  const db = await getDb();
  return db.collection<Reading>(COLLECTIONS.readings);
}

// Drop and recreate the scratch collection as a time series collection, then
// insert the fixed readings. The timeseries option cannot be added to an existing
// collection, so a re-run must drop first or createCollection errors on the
// already-existing name. granularity 'minutes' hints the server's internal bucket
// span to match the minute-scale readings, it does not affect query results.
export async function resetAndSeed(): Promise<void> {
  const db = await getDb();
  await db
    .collection(COLLECTIONS.readings)
    .drop()
    .catch(() => false);
  await db.createCollection(COLLECTIONS.readings, {
    timeseries: {
      timeField: TIME_FIELD,
      metaField: META_FIELD,
      granularity: 'minutes',
    },
  });
  const col = await readings();
  await col.insertMany(sampleReadings());
}

// The timeseries options the collection was created with, read back from the
// catalogue. Returns undefined if the collection is ordinary, which is exactly
// what the metadata assertion checks against. Typed loosely because the driver
// types listCollections options as a generic Document.
export async function collectionTimeseries(
  db: Db,
): Promise<{ timeField?: string; metaField?: string } | undefined> {
  const [info] = await db.listCollections({ name: COLLECTIONS.readings }).toArray();
  // listCollections types its entries as a union that only guarantees name and
  // type, so options is narrowed away. The full info object does carry options at
  // runtime, hence the explicit shape here rather than the union member.
  const full = info as { options?: { timeseries?: { timeField?: string; metaField?: string } } };
  return full?.options?.timeseries;
}

// Return the readings whose timestamp falls in the half-open window, in timestamp
// order. The half-open bound ($gte start, $lt end) is deliberate: a reading
// exactly on end is excluded, so a query that used $lte would wrongly include it
// and fail the expected-values assertion.
export async function readingsInWindow(start: Date, end: Date): Promise<Reading[]> {
  const col = await readings();
  return col
    .find({ timestamp: { $gte: start, $lt: end } }, { projection: { _id: 0 } })
    .sort({ timestamp: 1 })
    .toArray();
}

async function demo(): Promise<void> {
  await resetAndSeed();
  const db = await getDb();

  const ts = await collectionTimeseries(db);
  console.log('collection timeseries options:', ts);

  const inWindow = await readingsInWindow(WINDOW_START, WINDOW_END);
  console.log(
    `readings in [${WINDOW_START.toISOString()}, ${WINDOW_END.toISOString()}):`,
    inWindow.map((r) => ({ timestamp: r.timestamp.toISOString(), value: r.value })),
  );
  console.log(
    'window values:',
    inWindow.map((r) => r.value),
  );
}

// Run directly via `npm run ex:timeseries`. The import.meta.url guard keeps the
// exported helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
