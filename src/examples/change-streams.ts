import type { ChangeStream, ChangeStreamDocument, Collection, ResumeToken } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type EventDoc } from '../collections.js';

// The single document the demo and tests target with their update and delete. A
// fixed key so assertions can name exactly which document each event concerns.
export const TARGET_KEY = 'widget-1';
export const INITIAL_LABEL = 'first';
export const UPDATED_LABEL = 'second';

// The distinct key the resume test writes after capturing the token. A reopened
// stream resuming from the token must deliver this and only this, never a
// duplicate of the pre-token write, which is the whole point of the resume.
export const RESUME_KEY = 'widget-2';

// The operation types the demo exercises, in the order it performs the writes.
// Exported so the unit tier can assert this fixed sequence is the three distinct
// CRUD operations, guarding against the integration test passing on, say, three
// inserts.
export const EXPECTED_OPS = ['insert', 'update', 'delete'] as const;
export type ExpectedOp = (typeof EXPECTED_OPS)[number];

// Drop and recreate the scratch collection empty, so a run starts with no
// documents and the watch only ever sees this module's own writes. An explicit
// createCollection after drop means the collection exists before the watch opens,
// avoiding a first-write race on lazy creation.
export async function resetAndSeed(): Promise<Collection<EventDoc>> {
  const db = await getDb();
  const col = db.collection<EventDoc>(COLLECTIONS.events);
  await col.drop().catch(() => false);
  await db.createCollection(COLLECTIONS.events);
  return col;
}

// Pull the next change event off an open stream. .next() blocks until an event
// arrives, so callers must perform their writes after the stream is established or
// it waits indefinitely. Wrapped so the read intent reads clearly at call sites.
export async function nextEvent(
  stream: ChangeStream<EventDoc>,
): Promise<ChangeStreamDocument<EventDoc>> {
  return stream.next();
}

// Force the server side cursor open and pin the stream start time. watch() is
// lazy: the cursor is only created on the first server round trip, and its start
// operation time is set then. If writes happen before that, the stream starts
// after them and misses every event. tryNext() does the round trip without
// blocking (it returns null when there is nothing yet), so writes issued after it
// are guaranteed to land within the stream's window.
export async function establish(stream: ChangeStream<EventDoc>): Promise<void> {
  await stream.tryNext();
}

// Perform one insert, update and delete on the target document, returning the
// operationType of each event observed on the given open stream, in order. The
// stream must already be established before this is called or the writes are missed.
export async function observeCrudOps(
  col: Collection<EventDoc>,
  stream: ChangeStream<EventDoc>,
): Promise<string[]> {
  await establish(stream);
  await col.insertOne({ key: TARGET_KEY, label: INITIAL_LABEL });
  await col.updateOne({ key: TARGET_KEY }, { $set: { label: UPDATED_LABEL } });
  await col.deleteOne({ key: TARGET_KEY });

  const ops: string[] = [];
  for (let i = 0; i < EXPECTED_OPS.length; i += 1) {
    const event = await nextEvent(stream);
    ops.push(event.operationType);
  }
  return ops;
}

async function demo(): Promise<void> {
  const col = await resetAndSeed();

  // Path one: open a watch, perform the three CRUD writes, read back the events
  // and confirm each operationType. The watch must be open before the writes.
  const opsStream = col.watch<EventDoc>();
  const ops = await observeCrudOps(col, opsStream);
  await opsStream.close();
  console.log('observed operation types:', ops.join(', '));

  // Path two: resume from a stored token. Open a watch, do a write, capture its
  // resume token, then do a further write the closed stream never saw. Reopen
  // with resumeAfter and confirm the next event is the post-token write.
  await resetAndSeed();
  const firstStream = col.watch<EventDoc>();
  await establish(firstStream);
  await col.insertOne({ key: TARGET_KEY, label: INITIAL_LABEL });
  const firstEvent = await nextEvent(firstStream);
  // event._id is the resume token for that event. resumeAfter starts the new
  // stream strictly after it, so the captured event is not redelivered.
  const token: ResumeToken = firstEvent._id;
  await firstStream.close();

  // Written while no stream is open: only a token-driven resume can recover it.
  await col.insertOne({ key: RESUME_KEY, label: INITIAL_LABEL });

  const resumed = col.watch<EventDoc>([], { resumeAfter: token });
  const resumedEvent = await nextEvent(resumed);
  await resumed.close();

  const recoveredKey =
    resumedEvent.operationType === 'insert' ? resumedEvent.fullDocument.key : '(not an insert)';
  console.log('resumed stream delivered key:', recoveredKey);
}

// Run directly via `npm run ex:change-streams`. The import.meta.url guard keeps
// the exported helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
