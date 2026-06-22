# Deliverable 12 — Time series collections

## Purpose

A headless example that creates a Mongo time series collection, inserts fixed
timestamped measurements and runs a half-open time-window query over them. It
owns a dedicated `readings` scratch collection, dropped and recreated as a time
series collection each run, so the query only ever sees this module's own fixed
readings. [`src/examples/timeseries.ts`](../../src/examples/timeseries.ts)
creates the collection with `createCollection` and a `timeseries` option, inserts
six fixed-timestamp readings that straddle the window, reads the timeseries
options back from the catalogue and runs a `[start, end)` query that returns only
the readings inside the window. Run it with `npm run ex:timeseries`; it prints
the timeseries options (timeField `timestamp`, metaField `sensorId`, granularity
`minutes`) and the in-window values `[12, 13, 14]`, then exits zero.

## Public interface

### [`src/examples/timeseries.ts`](../../src/examples/timeseries.ts)

All helpers operate on the `readings` scratch collection, typed as
`Collection<Reading>`.

- `TIME_FIELD: string` and `META_FIELD: string` — the `timeField` and `metaField`
  the collection is created on (`timestamp` and `sensorId`), stated explicitly so
  the metadata assertion checks the real timeField rather than a default.
- `WINDOW_START: Date` and `WINDOW_END: Date` — the fixed half-open window
  `[start, end)` the query ranges over.
- `EXPECTED_WINDOW_VALUES: readonly [12, 13, 14]` — the exact ordered values an
  in-window query must return, exported so the test names the precise result a
  wrong bound would not produce.
- `sampleReadings(): Reading[]` — the deterministic readings, all from one sensor,
  straddling the window with two before start, three inside and one exactly on
  end.
- `resetAndSeed(): Promise<void>` — drops and recreates the collection as a time
  series collection then inserts the readings, so the test can establish the same
  known state.
- `collectionTimeseries(db): Promise<{ timeField?, metaField? } | undefined>` — the
  timeseries options read back from the catalogue, undefined for an ordinary
  collection.
- `readingsInWindow(start, end): Promise<Reading[]>` — readings whose timestamp
  falls in `[start, end)`, timestamp ordered.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.readings` — the scratch collection name the time series module
  owns.
- `interface Reading` — the document shape (`timestamp: Date`, `sensorId: string`,
  `value: number`), passed as the driver generic
  `db.collection<Reading>(COLLECTIONS.readings)`. `timestamp` is a `Date` because
  a time series timeField must be a BSON date.

### [`package.json`](../../package.json)

- `ex:timeseries` — runs the module via `tsx src/examples/timeseries.ts`.

## Key decisions

- The collection is created with
  `createCollection(name, { timeseries: { timeField, metaField, granularity } })`.
  The timeseries option cannot be added to an existing collection, so
  `resetAndSeed` drops first then recreates, otherwise a re-run errors on the
  existing name.
- `timeField` is a BSON `Date` (the `Reading.timestamp` type). The server rejects
  an insert whose timeField is any other type, so the interface fixes it.
- The window is half open `[start, end)` via `$gte start, $lt end`. The reading
  exactly on `end` (value 15) is deliberately excluded, so an inclusive `$lte`
  would wrongly include it and fail the expected-values assertion. This is the
  bound the test pins.
- All readings share one `sensorId`, so the window query is the only thing that
  selects between them, isolating the behaviour under test.
- `granularity: 'minutes'` hints the internal bucket span to the minute-scale
  data. It does not affect query results, only storage bucketing; the server
  derives `bucketMaxSpanSeconds` (86400) from it.
- Metadata is read back from
  `db.listCollections({ name }).toArray()[0].options.timeseries`. The driver
  narrows the entry type to name and type only, so the access casts to a minimal
  runtime shape rather than `any`.

## Verified behaviour

Confirmed by the judge (PASS). `npm run ex:timeseries` runs and exits zero,
printing the timeseries options (timeField `timestamp`, metaField `sensorId`,
granularity `minutes`) and the in-window readings `[12, 13, 14]`. The integration
tier asserts the catalogue metadata confirms a time series collection with
`timeField === 'timestamp'` and `metaField === 'sensorId'`, and that the window
query returns exactly `[12, 13, 14]` in order with every returned timestamp inside
`[start, end)`. Because `collectionTimeseries` returns undefined for an ordinary
collection, the metadata assertion fails if the collection were created plain.

One hollow check returned ASSERTS, so the tests prove behaviour rather than
passing vacuously:

- Window bound (integration): flipping the upper bound `$lt end` to `$lte end` let
  the on-end reading 15 leak in, caught by the exact expected-values assertion.

## Gotchas

- Time series collections need Mongo 5.0+. This harness runs Mongo 8, so it is
  fine. They are not available on older servers.
- The timeField must be a BSON date, not a number or string, or inserts fail.
- The timeseries option is immutable: you cannot convert an ordinary collection to
  time series or vice versa, you must drop and recreate.
- The window query needs live Mongo, so both behavioural tests are integration
  tier only; the module declares no unit tests.
- The shared client must be closed (`closeClient`) or the process will not exit.

## Dependencies

Builds on deliverable 3 (the connection helper and seed):
[3-connection-helper-and-seed](./3-connection-helper-and-seed.md). It uses the
shared client from [`src/db.ts`](../../src/db.ts) and the centralised collection
names and shapes from [`src/collections.ts`](../../src/collections.ts), and seeds
its own `readings` scratch collection rather than relying on the faker seed.
