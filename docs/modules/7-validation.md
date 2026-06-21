# Deliverable 7 — Schema validation

## Purpose

A collection `$jsonSchema` validator demonstrated through the native TypeScript
driver, with an accepted conforming write and a server-rejected non-conforming
write. [`src/examples/validation.ts`](../../src/examples/validation.ts) recreates a
`members` collection carrying the validator, then inserts one document that
satisfies the schema and one crafted to violate it. Run it with
`npm run ex:validation`; it prints the accepted insert, the rejected insert with its
error code and rule, the stored count, and exits zero.

## Public interface

### [`src/examples/validation.ts`](../../src/examples/validation.ts)

The helpers operate on the `members` scratch collection, typed as
`Collection<Member>`. The validator requires `name` and `email` as non-empty
strings, `email` to match an address-shaped pattern, and `age` to be a number at or
above 18.

- `DOCUMENT_VALIDATION_FAILED` — the MongoServerError code (121) the server raises
  when a write fails a collection validator. Tests assert on this constant so a
  generic throw does not satisfy them.
- `createValidatedCollection()` — drops and recreates `members` with the
  `$jsonSchema` validator, `validationLevel: 'strict'` and
  `validationAction: 'error'`. Idempotent, so re-running is safe. Returns
  `Collection<Member>`.
- `insertConforming(member)` — inserts a document expected to satisfy the schema.
  Returns `InsertOneResult<Member>`.
- `attemptInsert(doc)` — inserts a document crafted to violate the schema; a
  rejection throws the MongoServerError for the caller or test to assert on. Returns
  `InsertOneResult<Member>` on the accept path.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.members: 'members'` — the scratch collection name the validation
  module owns.
- `interface Member` — the validated document shape (`name`, `email`, `age`),
  passed as the driver generic `db.collection<Member>(COLLECTIONS.members)`.

## Usage

Run the example via npm, which wraps `tsx src/examples/validation.ts`:

```
npm run ex:validation
```

It prints `accepted conforming member, id: ...`, then
`rejected non-conforming member, code: 121 rule: $jsonSchema`, then
`members stored: 1`, and exits zero. The exported helpers are importable from tests
without re-running the script, the `import.meta.url` main-guard runs the demo only
when the module is the process entry point and calls `closeClient()` in finally.

## Key decisions

- **`age` bsonType is `number`, not `int`.** The Node driver serialises a plain JS
  number as BSON double, so a strict `int` validator would reject a conforming
  `age: 30`. `number` accepts any numeric BSON type while `minimum: 18` still gates
  out-of-range values, so a genuinely conforming document inserts cleanly and a
  genuinely bad one is rejected.
- **Assert on code 121 and the operatorName, not codeName.** This driver version
  does not populate `codeName` on the validation error, so the reject test asserts
  on the MongoServerError name, `code === 121`, and
  `errInfo.details.operatorName === '$jsonSchema'`, which names the rule that fired.
  The test still fails if the validator is absent and the bad write silently
  succeeds.
- **Locked schema.** `additionalProperties: false` keeps the document to the three
  fields, so `_id` is listed explicitly as an objectId or the server-assigned id
  would itself fail validation.

## Gotchas

- **The collection is dropped on every run.** `createValidatedCollection()` drops
  `members`, so it is reproducible but destructive. Do not point the module at a
  collection that holds data you need. The name lives in `COLLECTIONS`, it is never
  hardcoded.
- **Validation is server-side.** The rule lives on the collection, not in
  application code, so the rejection is a MongoServerError from the write itself,
  not a client-side check.
- **Integration tier only.** Every helper needs live Mongo, so the tests live in
  [`src/examples/validation.integration.test.ts`](../../src/examples/validation.integration.test.ts).
  There is no dependency-free behaviour worth a unit test, so no unit file exists,
  matching the CRUD, indexes and aggregation modules.

## Dependencies

Depends on deliverable 3 (connection helper and seed): uses `getDb` and
`closeClient` from [`src/db.ts`](../../src/db.ts) and the `COLLECTIONS` registry from
[`src/collections.ts`](../../src/collections.ts).

## Verification

Judged PASS on branch `7-schema-validation` with the Mongo endpoint up. Summary of
the judge result, cited not re-run:

- All acceptance criteria met: `npm run ex:validation` runs and exits zero; it
  prints an accepted write (`accepted conforming member, id: ...`) and a rejected
  write (`rejected non-conforming member, code: 121 rule: $jsonSchema`); a test
  asserts a conforming document inserts successfully; two tests assert a
  non-conforming document is rejected with a document validation error (below-minimum
  age, missing required field), each asserting `code === 121` and
  `errInfo.details.operatorName === '$jsonSchema'` then confirming the bad document
  never lands.
- Both tiers green: unit tier 3 tests pass with no validation test misclassified into
  it, integration tier 27 tests pass across deliverables 1 to 7, of which 3 are the
  new validation tests.
- Hollow-test proven by a negative run (temporary, reverted): flipping
  `validationAction` from `'error'` to `'warn'` lets the bad write succeed, which
  turned the rejection test red, and the tier returned to green after restore. The
  load-bearing assertions are wired to real server validation, not hollow.
- `tsc --noEmit` clean and `eslint` clean on the changed files, both exit zero.
