# Deliverable 4 — CRUD

## Purpose

The core MongoDB CRUD operations demonstrated through the native TypeScript
driver. [`src/examples/crud.ts`](../../src/examples/crud.ts) covers insertOne,
insertMany, find with a filter and a projection, updateOne, updateMany, upsert,
deleteOne and deleteMany. Run it with `npm run ex:crud`; it prints each
operation's result and exits zero.

## Public interface

### [`src/examples/crud.ts`](../../src/examples/crud.ts)

All functions operate on the `widgets` scratch collection, typed as
`Collection<Widget>`.

- `insertOneWidget(widget)` — returns the driver `InsertOneResult` carrying the
  new `_id`.
- `insertManyWidgets(items)` — returns the `InsertManyResult` carrying a map of
  new `_id`s.
- `findInStock(minStock)` — finds widgets with `stock >= minStock`, projecting to
  `{ sku, stock }` only (drops `_id`). Returns partial documents by design.
- `restockOne(sku, stock)` — updateOne setting stock for one sku. Returns
  `{ matched, modified }` counts.
- `recolourAll(from, to)` — updateMany changing colour on every matching
  document. Returns `{ matched, modified }`.
- `upsertBySku(widget)` — updateOne with `upsert: true` keyed on sku. Returns
  `{ upserted }`, true only when a new document was created.
- `deleteOneBySku(sku)` — returns the deleted count (0 or 1).
- `deleteManyByColour(colour)` — returns the count of deleted documents.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.widgets: 'widgets'` — the scratch collection name CRUD owns.
- `interface Widget` — the document shape (`sku`, `colour`, `stock`), passed as the
  driver generic `db.collection<Widget>(COLLECTIONS.widgets)`.

## Usage

Run the example via npm, which wraps `tsx src/examples/crud.ts`:

```
npm run ex:crud
```

It prints each operation's result and exits zero: the inserted ids, the projected
find, the update match and modify counts, whether the upsert created or updated,
the delete counts, and the remaining document count.

The exported functions are importable from tests without re-running the script,
the `import.meta.url` main-guard runs the demo only when the module is the process
entry point.

## Gotchas

- **Scratch collection, not the seed.** CRUD mutates and deletes, so it must not
  run against the seeded `users`, `places` and `posts` that other deliverables'
  tests assert on. It works in its own `widgets` collection. The name lives in
  `COLLECTIONS`, it is never hardcoded.
- **Mutation safety in tests.** The integration test drops `widgets` in
  `beforeEach` so every test starts from a known empty state and the suite is order
  independent. `afterAll` drops it again and closes the shared client.
- **Integration tier only.** Every operation touches live Mongo, so the tests are
  integration tier in
  [`src/examples/crud.integration.test.ts`](../../src/examples/crud.integration.test.ts).
  There is no dependency-free behaviour worth a unit test, so no unit file exists,
  an empty one would be a hollow suite.
- **Untouched-document assertions.** The updateMany and deleteMany tests seed a
  blue widget the colour filter excludes, then assert it survives unchanged,
  proving the operations are scoped to their filter rather than touching
  everything.
- **Upsert return shape.** The driver reports a created document via a non-null
  `upsertedId`; the helper collapses that to a boolean `upserted` flag, true only
  on create.

## Verification

Judged PASS on branch `4-crud` with the Mongo endpoint up. Summary of the judge
result, cited not re-run:

- All four acceptance criteria met: `npm run ex:crud` runs and exits zero; insert
  tests assert ids are returned and the documents are retrievable by `_id`; an
  update test asserts only matched documents change and an upsert test asserts a
  document is created when absent; a delete test asserts only matched documents are
  removed.
- Both tiers green: unit tier 3 tests pass with no CRUD tests misclassified into
  it, integration tier 12 tests pass of which 8 are the new CRUD tests.
  `tsc --noEmit` clean.
- Hollow-test proven by three negative runs (temporary, reverted): a match-all
  updateMany filter failed the untouched-non-matching-docs assertion, `upsert: false`
  failed the creates-when-absent assertion, and an empty `insertedIds` failed the
  insert-returns-ids assertion. The load-bearing assertions are wired to real
  state, not hollow.
