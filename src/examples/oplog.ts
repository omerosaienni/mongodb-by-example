import type { Collection } from 'mongodb';
import { getClient, getDb, closeClient, DB_NAME } from '../db.js';
import { COLLECTIONS, type Counter } from '../collections.js';

// The single counter document this example targets. A fixed natural key so the
// demo and the tests reseed to the same start and match the same oplog entry.
export const COUNTER_NAME = 'visits';
export const START_VALUE = 5;
export const INCREMENT = 3;

// The system identifiers for the replication oplog. It is a capped collection in
// the `local` database, not in the harness db, so it is named here as a literal
// rather than in collections.ts which holds only project-owned collections.
const OPLOG_DB = 'local';
const OPLOG_COLLECTION = 'oplog.rs';

// A replication oplog entry, narrowed to the fields this example reads. `o` is
// the operation payload, `o2` the document selector for an update. From mongo 5+
// an update `o` is the $v:2 delta format below, not the raw update modifier.
export interface OplogEntry {
  op: string;
  ns: string;
  o: OplogDelta;
  o2?: { _id?: unknown };
}

// The $v:2 update delta. `diff.u` maps each updated field to its RESULTING
// absolute value, the property that makes the oplog idempotent: replaying it
// re-applies the same end state regardless of the document's prior value. A
// relative instruction like $inc would not be replay-safe, so it is never logged.
export interface OplogDelta {
  $v?: number;
  diff?: {
    u?: Record<string, unknown>;
    i?: Record<string, unknown>;
    d?: Record<string, unknown>;
  };
  // A pre-5.0 server would log the raw modifier here, so the predicate below can
  // still spot a $inc to prove the format claim rather than assume it.
  [key: string]: unknown;
}

// Pure: does this delta carry a $inc (or any update operator) anywhere, meaning
// the relative instruction was logged rather than the resolved value. Serialising
// and string-matching catches the operator at any nesting depth without walking
// the shape by hand. Factored out so the unit tier proves the idempotency check
// with no database and the integration tier reuses the same definition.
export function deltaContainsInc(o: OplogDelta): boolean {
  return JSON.stringify(o).includes('$inc');
}

// Pure: pull the resulting absolute value the delta assigned to a field, or
// undefined if the delta did not update it. The $v:2 format puts updated fields
// under diff.u, so the absolute new value is read straight from there.
export function extractUpdatedValue(o: OplogDelta, field: string): unknown {
  return o.diff?.u?.[field];
}

async function counters(): Promise<Collection<Counter>> {
  const db = await getDb();
  return db.collection<Counter>(COLLECTIONS.counters);
}

// Drop and recreate the single counter at its known start, so re-running is
// idempotent and every run begins from the same value.
export async function resetAndSeed(): Promise<Collection<Counter>> {
  const col = await counters();
  await col.drop().catch(() => false);
  await col.insertOne({ name: COUNTER_NAME, counter: START_VALUE });
  return col;
}

// $inc the counter by amount and return the document _id, so the caller can match
// the exact oplog entry this update produced.
export async function incrementCounter(name: string, amount: number): Promise<unknown> {
  const col = await counters();
  await col.updateOne({ name }, { $inc: { counter: amount } });
  const doc = await col.findOne({ name });
  return doc?._id;
}

// Read back the latest oplog entry for the given document _id. oplog.rs is a
// capped collection ordered by insertion, so $natural descending gives newest
// first, and the o2._id selector pins it to this exact document's update. The ns
// is the fully-qualified namespace `<db>.<collection>`.
export async function latestUpdateEntry(id: unknown): Promise<OplogEntry | null> {
  const client = getClient();
  await client.connect();
  const oplog = client.db(OPLOG_DB).collection<OplogEntry>(OPLOG_COLLECTION);
  return oplog.findOne(
    { op: 'u', ns: `${DB_NAME}.${COLLECTIONS.counters}`, 'o2._id': id },
    { sort: { $natural: -1 } },
  );
}

async function demo(): Promise<void> {
  await resetAndSeed();
  console.log('seeded counter', COUNTER_NAME, 'at', START_VALUE);

  const id = await incrementCounter(COUNTER_NAME, INCREMENT);
  console.log(`incremented by ${INCREMENT} (relative instruction sent to the server)`);

  const entry = await latestUpdateEntry(id);
  if (entry === null) {
    console.log('ERROR: no oplog entry found for the update');
    process.exitCode = 1;
    return;
  }

  console.log('oplog o delta:', JSON.stringify(entry.o));
  console.log('logged absolute value:', extractUpdatedValue(entry.o, 'counter'));
  console.log('contains a $inc operator:', deltaContainsInc(entry.o));
}

// Run directly via `npm run ex:oplog`. The import.meta.url guard keeps the
// exported helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
