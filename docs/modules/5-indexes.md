# Deliverable 5 — Indexes

## Purpose

Three MongoDB index types demonstrated through the native TypeScript driver, with
explain used to prove the query planner serves a query from an index scan rather
than a collection scan. [`src/examples/indexes.ts`](../../src/examples/indexes.ts)
creates a compound index, a partial index and a TTL index. Run it with
`npm run ex:indexes`; it prints the built indexes, whether the category query uses
an index scan, and the active scores read back through the partial index, then
exits zero.

## Public interface

### [`src/examples/indexes.ts`](../../src/examples/indexes.ts)

All helpers operate on the `metrics` scratch collection, typed as
`Collection<Metric>`.

- `INDEX_NAMES` — the three explicit index names (`category_score`,
  `active_score_partial`, `expireAt_ttl`) so callers and tests assert by a stable
  name rather than a reconstructed key name.
- `TTL_SECONDS` — the TTL window the index is created with (3600).
- `createIndexes()` — builds all three indexes. Idempotent: re-running is a no-op.
- `explainCategoryQuery(category)` — runs `explain('queryPlanner')` on a query
  that filters on category and sorts by score descending, returning the explain
  document.
- `planUsesIndexScan(explain)` / `planUsesCollectionScan(explain)` — recursively
  walk the winning plan and report whether an IXSCAN / COLLSCAN stage appears.
- `activeScoresViaPartialIndex()` — reads `active: true` documents hinting the
  partial index, returning their scores in descending order.
- `sampleMetrics(base)` — the deterministic seed documents from a fixed base date.
- `resetAndSeed(base)` — drops, repopulates and indexes the scratch collection.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.metrics: 'metrics'` — the scratch collection name the index module
  owns.
- `interface Metric` — the document shape (`category`, `score`, `active`,
  `expireAt`), passed as the driver generic
  `db.collection<Metric>(COLLECTIONS.metrics)`. Each field backs one index:
  `category` and `score` the compound index, `active` the partial index, and
  `expireAt` the TTL index.

## Usage

Run the example via npm, which wraps `tsx src/examples/indexes.ts`:

```
npm run ex:indexes
```

It prints the built index names, `category query uses index scan: true`,
`category query uses collection scan: false`, and the active scores `[ 90, 80, 70 ]`
read through the partial index. The exported helpers are importable from tests
without re-running the script, the `import.meta.url` main-guard runs the demo only
when the module is the process entry point.

## Gotchas

- **Scratch collection, not the seed.** The module drops and rebuilds `metrics`,
  so it must not run against the seeded `users`, `places` and `posts`, nor against
  the CRUD `widgets` scratch space. The name lives in `COLLECTIONS`, it is never
  hardcoded.
- **The explain stage is the gate, not the result.** `planUsesIndexScan`
  recursively walks the winning plan over `inputStage` and `inputStages`, because
  the planner nests stages (SORT over FETCH over IXSCAN, or a covered IXSCAN
  alone). The test asserts IXSCAN is present and COLLSCAN is absent, so it fails
  if the index is dropped or ignored, not merely if the query returns nothing.
- **Partial index proven by a hint, not a delete.** A hinted read of the partial
  index returns only the active documents; the inactive ones (`score` 50 and 30)
  were never indexed, so they are absent from the hinted result. This is checkable
  synchronously, unlike a TTL deletion.
- **TTL asserted by metadata, not by deletion.** Mongo's TTL monitor runs roughly
  once a minute, so the test asserts the index exists with the expected
  `expireAfterSeconds`, never that a document was removed. A deletion test would be
  slow and flaky.
- **Deterministic base date.** `expireAt` is derived from a fixed base date passed
  into `sampleMetrics`/`resetAndSeed`, never `now()`, so the seeded data and every
  assertion are stable across runs.
- **Integration tier only.** Every helper needs live Mongo (explain, listIndexes,
  hinted reads), so the tests are integration tier in
  [`src/examples/indexes.integration.test.ts`](../../src/examples/indexes.integration.test.ts).
  There is no dependency-free behaviour worth a unit test, so no unit file exists.

## Verification

Judged PASS on branch `5-indexes` with the Mongo endpoint up. Summary of the judge
result, cited not re-run:

- All four acceptance criteria met: `npm run ex:indexes` runs and exits zero;
  `listIndexes` tests confirm each index with its expected keys and options
  (compound keys, partial `partialFilterExpression`, TTL `expireAfterSeconds`); the
  explain test asserts the winning plan is IXSCAN and not COLLSCAN; the partial
  test asserts the inactive documents are absent from the hinted partial-index
  read.
- Both tiers green: unit tier 3 tests pass with no index test misclassified into
  it, integration tier 17 tests pass across deliverables 1 to 5, of which 5 are the
  new index tests. `tsc --noEmit` clean.
- Hollow-test proven by two negative runs (temporary, reverted): removing the
  compound index made the explain query fall to a COLLSCAN and failed the
  IXSCAN-not-COLLSCAN assertion, and indexing the inactive documents (dropping the
  partial filter) failed the partial-exclusion assertion. The load-bearing
  assertions are wired to real planner and index state, not hollow.
