# Deliverable 11 — Change streams

## Purpose

A headless example that opens a change stream on its own scratch collection,
performs writes and observes the resulting events, then resumes a closed stream
from a stored token. It owns a dedicated `events` collection, recreated empty
each run, so the watch only ever sees this module's own writes.
[`src/examples/change-streams.ts`](../../src/examples/change-streams.ts) opens a
watch, inserts, updates and deletes one fixed document and reads back the
`operationType` of each event in order, then opens a second watch, captures the
per-event resume token, performs a further write while no stream is open and
reopens with `resumeAfter` to recover that post-token write and only it. Run it
with `npm run ex:change-streams`; it prints the observed operation types
(`insert, update, delete`) and the key the resumed stream delivered
(`widget-2`), then exits zero.

## Public interface

### [`src/examples/change-streams.ts`](../../src/examples/change-streams.ts)

All helpers operate on the `events` scratch collection, typed as
`Collection<EventDoc>` and watched as `ChangeStream<EventDoc>`.

- `TARGET_KEY`, `INITIAL_LABEL`, `UPDATED_LABEL` — the fixed document the CRUD
  path inserts, updates and deletes, and the two distinct labels an update moves
  between so an update event carries a real change.
- `RESUME_KEY` — the distinct key the resume path writes after capturing the
  token, so the recovered event is identifiable and cannot be confused with a
  redelivery of the pre-token write.
- `EXPECTED_OPS: readonly ['insert', 'update', 'delete']` and type `ExpectedOp` —
  the fixed operation sequence the demo exercises, exported so the unit tier can
  pin it to three distinct CRUD operations in order.
- `resetAndSeed(): Promise<Collection<EventDoc>>` — drops and recreates the empty
  scratch collection, returning the typed handle.
- `establish(stream): Promise<void>` — forces the lazy server side cursor open
  via `tryNext()`, pinning the stream start time before any write.
- `nextEvent(stream): Promise<ChangeStreamDocument<EventDoc>>` — reads the next
  event off an open stream, blocking until one arrives.
- `observeCrudOps(col, stream): Promise<string[]>` — performs the three writes and
  returns the `operationType` of each observed event in order.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.events` — the scratch collection name the change-streams module
  owns.
- `interface EventDoc` — the document shape (`key`, `label`), passed as the driver
  generic `db.collection<EventDoc>(COLLECTIONS.events)` and `watch<EventDoc>`.

### [`package.json`](../../package.json)

- `ex:change-streams` — runs the module via `tsx src/examples/change-streams.ts`.

## Key decisions

- The server side cursor is forced open with `establish()` before any write,
  because `watch()` is lazy: the cursor and its start operation time are only set
  on the first server round trip. Writes issued before that fall outside the
  stream window and `.next()` then blocks forever waiting for events that already
  happened. `tryNext()` does the round trip without blocking, so writes after it
  are guaranteed to land inside the window.
- The resume uses `resumeAfter` with the per-event token taken from
  `firstEvent._id`, not `stream.resumeToken`, so it pins to one specific event and
  the reopened stream starts strictly after it, meaning the captured pre-token
  event is not redelivered.
- `fullDocument: 'updateLookup'` is requested only in the assertion that checks
  the changed label, since an update event otherwise carries only the change
  description and not the post-update document. The operationType-ordering test
  does not need it.
- A dedicated `events` scratch collection is recreated each run, with an explicit
  `createCollection` after the drop so it exists before the watch opens, avoiding
  a first-write race on lazy collection creation, and so the watch never sees
  another deliverable's documents.

## Verified behaviour

Confirmed by the judge (PASS). `npm run ex:change-streams` runs and exits zero,
printing `observed operation types: insert, update, delete` and
`resumed stream delivered key: widget-2` (the post-token key). The integration
tier asserts that an insert, update and delete arrive in order, that an update
event carries the changed label when `updateLookup` is requested, and that a
resume from a stored token delivers the post-token write (`RESUME_KEY`) and not a
duplicate of the earlier one. The unit tier pins the fixed dataset so the
integration assertions cannot pass vacuously: the operation sequence is exactly
insert, update, delete with no repeat, `RESUME_KEY` differs from `TARGET_KEY` and
the two labels differ.

Two hollow checks both returned ASSERTS, so the tests prove behaviour rather than
passing vacuously:

- operationType gate (integration): flipping the delete write in `observeCrudOps`
  to a second update made the third observed op `update`, caught by the
  insert/update/delete order assertion.
- Resume distinctness gate (integration): making `RESUME_KEY` equal `TARGET_KEY`
  let the resumed insert carry `widget-1`, caught by
  `expect(fullDocument.key).not.toBe(TARGET_KEY)`.

## Gotchas

- Change streams require a replica set. This project runs a single node replica
  set precisely so they work; they error on a standalone mongod.
- The watch must be open before the writes or `.next()` blocks forever, since a
  change stream only delivers events that occur after it opens. `establish()`
  pins the start time before the writes to avoid this.
- Every stream must be closed and the shared client closed (`closeClient`) or the
  process will not exit.
- An update event carries the post-update document only when
  `fullDocument: 'updateLookup'` is requested, otherwise it carries only the
  change description.
- The watch needs live Mongo, so the behavioural tests are integration tier only,
  with the fixture-shape assertions in the unit tier.

## Dependencies

Builds on deliverable 3 (the connection helper and seed):
[3-connection-helper-and-seed](./3-connection-helper-and-seed.md). It uses the
shared client from [`src/db.ts`](../../src/db.ts) and the centralised collection
names and shapes from [`src/collections.ts`](../../src/collections.ts), and seeds
its own `events` scratch collection rather than relying on the faker seed.
