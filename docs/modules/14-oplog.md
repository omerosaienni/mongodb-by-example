# Deliverable 14 — Oplog peek

## Purpose

A demonstration that the replication oplog stores a relative `$inc` update in
idempotent form: the logged entry carries the resulting absolute value, not the
increment instruction.
[`src/examples/oplog.ts`](../../src/examples/oplog.ts) seeds a single counter
(`visits`) at a fixed start, sends a relative `$inc` to the server, then reads
the newest matching `local.oplog.rs` entry and shows its `$v:2` delta holds the
absolute total. Run it with `npm run ex:oplog`; it prints the seeded counter at
5, the increment by 3, the oplog `o` delta `{"$v":2,"diff":{"u":{"counter":8}}}`,
the logged absolute value 8 and `contains a $inc operator: false`, then exits
zero.

## Public interface

### [`src/examples/oplog.ts`](../../src/examples/oplog.ts)

The scratch helpers operate on the `counters` collection in `mongodb-by-example`, typed as
`Collection<Counter>`; the oplog read targets `local.oplog.rs`.

- `COUNTER_NAME` (`'visits'`), `START_VALUE` (5), `INCREMENT` (3) — the fixed
  target and known numbers, so a test can assert the logged value is
  start + increment.
- `OplogEntry`, `OplogDelta` — the typed shape of the oplog entry and its `$v:2`
  delta, narrowed to the fields this example reads.
- `deltaContainsInc(o): boolean` — pure predicate, true if the delta carries a
  `$inc` (or any update operator) anywhere, meaning the relative instruction was
  logged rather than the resolved value.
- `extractUpdatedValue(o, field): unknown` — pure, reads the resulting absolute
  value the `$v:2` diff assigned to a field, under `diff.u`.
- `resetAndSeed(): Promise<Collection<Counter>>` — drops and recreates the single
  counter at `START_VALUE`, so re-running is idempotent.
- `incrementCounter(name, amount): Promise<unknown>` — `$inc` the counter and
  returns the document `_id`, so the caller can match the exact oplog entry.
- `latestUpdateEntry(id): Promise<OplogEntry | null>` — the newest `op: 'u'`
  oplog entry for that `_id` in `mongodb-by-example.counters`, sorted `$natural: -1`.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.counters` — the scratch collection name the oplog module owns.
- `interface Counter` — the document shape (`name`, `counter`), passed as the
  driver generic `db.collection<Counter>(COLLECTIONS.counters)`.

### [`package.json`](../../package.json)

- `ex:oplog` — runs the module via `tsx src/examples/oplog.ts`.

## Key decisions

- The oplog is read via `getClient().db('local').collection('oplog.rs')`, not the
  harness `getDb()` handle, because the oplog lives in the `local` database, a
  separate db from `mongodb-by-example`. Still the one shared client, so no extra
  connection.
- The `$v:2` delta carries absolute values by design: replication must be
  replay-safe, so a relative `$inc` is resolved to its result before logging.
  That is the teaching point and the thing the test pins.
- A pure predicate (`deltaContainsInc`) and extractor (`extractUpdatedValue`) are
  factored out, so the unit tier proves the idempotency check with no database
  and the integration tier reuses the same definitions, meaning both tiers agree
  on what idempotent form means.
- The exact entry is matched by `op: 'u'`, `ns: 'mongodb-by-example.counters'` and
  `o2._id === id`, sorted `$natural: -1` (newest first), so a re-run or another
  test's write cannot be mistaken for this one.

## Verified behaviour

Confirmed by the judge (PASS). `npm run ex:oplog` runs and exits zero, printing
the live oplog `o` delta `{"$v":2,"diff":{"u":{"counter":8}}}`, the logged
absolute value 8 (start 5 + inc 3, not the relative 3) and
`contains a $inc operator: false`. The integration tier incs the seeded counter,
reads the latest matching oplog entry pinned to that exact document and asserts
the delta holds the absolute total with no `$inc`, then asserts a repeated inc
logs the new running total, again absolute. The unit tier pins the two pure
predicates against a good `$v:2` delta and a bad delta carrying `$inc`, so the
integration assertions cannot pass vacuously.

A hollow check returned ASSERTS, so the tests prove behaviour rather than passing
vacuously: flipping the sort from `$natural: -1` to `$natural: 1` reads the
oldest oplog entry instead of the newest and the integration assertion caught it.

## Gotchas

- `local.oplog.rs` is a capped, system-owned collection. The module only reads
  it, it never clears or writes it. The scratch `counters` collection in
  `mongodb-by-example` is what gets reset.
- The delta format is `$v:2` only on mongo 5+; the harness runs mongo 8.0. The
  observed `o` is `{"$v":2,"diff":{"u":{"counter":8}}}` for start 5 plus inc 3.
  A pre-5.0 server would log the raw modifier, so `deltaContainsInc` guards that
  shape too rather than assuming the format.
- `ns` is the fully-qualified namespace `<db>.<collection>`, not the bare
  collection name.
- Reading the oplog needs live Mongo, so the behavioural tests are integration
  tier only, with the pure-predicate assertions in the unit tier.

## Dependencies

Builds on deliverable 3 (the connection helper and seed):
[3-connection-helper-and-seed](./3-connection-helper-and-seed.md). It uses the
shared client from [`src/db.ts`](../../src/db.ts) and the centralised collection
names and shapes from [`src/collections.ts`](../../src/collections.ts), and seeds
its own `counters` scratch collection rather than relying on the faker seed.
