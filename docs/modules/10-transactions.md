# Deliverable 10 — Transactions

## Purpose

A multi-document ACID transaction on the replica set: a transfer between two
accounts that either commits both writes or aborts both, with the total balance
conserved across either outcome.
[`src/examples/transactions.ts`](../../src/examples/transactions.ts) seeds two
fixed accounts (`acct-alice` 100, `acct-bob` 40), then runs a guarded debit and a
credit inside one `withSession` + `withTransaction`. It demonstrates a commit (30
moves, both balances change), a forced mid-transaction abort (the debit rolls
back), and an overdrawing transfer that aborts before any write lands. Run it with
`npm run ex:transactions`; it prints the starting balances, the post-commit
balances, the abort outcome and the post-abort balances, with the total unchanged
throughout, then exits zero.

## Public interface

### [`src/examples/transactions.ts`](../../src/examples/transactions.ts)

All helpers operate on the `accounts` scratch collection, typed as
`Collection<Account>`.

- `SOURCE_ID`, `TARGET_ID` — the two fixed account ids the demo and tests transfer
  between.
- `STARTING_BALANCES: readonly Account[]` — the deterministic seed (`acct-alice`
  100, `acct-bob` 40) the demo and tests share.
- `TOTAL` — the conserved total (140), derived from the seed, so tests assert one
  concrete invariant value.
- `ForcedAbort` — a dedicated error type thrown to force a mid-transaction abort,
  so the test asserts the rollback was triggered by the intended fault rather than
  an unrelated driver error.
- `resetAndSeed(): Promise<Collection<Account>>` — drops and recreates the two
  accounts at their starting balances, so re-running is idempotent.
- `transfer(source, target, amount, { failMidway? }): Promise<void>` — debit then
  credit inside one `client.withSession` + `session.withTransaction`, both
  `updateOne` calls passing `{ session }`. The debit filter requires
  `balance >= amount`, so an overdraw matches nothing and aborts; `failMidway`
  throws a `ForcedAbort` after the debit to demonstrate rollback.
- `totalBalance(): Promise<number>` — sums every balance via `$group`, the live
  conserved total the tests assert.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.accounts` — the scratch collection name the transactions module
  owns.
- `interface Account` — the document shape (`accountId`, `balance`), passed as the
  driver generic `db.collection<Account>(COLLECTIONS.accounts)`.

### [`package.json`](../../package.json)

- `ex:transactions` — runs the module via `tsx src/examples/transactions.ts`.

## Key decisions

- Uses `client.withSession` + `session.withTransaction` rather than a manual
  `startSession` / `startTransaction` / `commitTransaction`, because the driver
  then owns the commit, the retry of transient transaction errors and the session
  lifecycle, so there is no session to leak and a thrown error inside the callback
  aborts cleanly.
- The debit filter carries the `balance >= amount` guard, so an overdraw matches
  no document and the transfer aborts before the credit can apply on its own,
  rather than producing a negative balance.
- The abort demonstration throws a dedicated `ForcedAbort`, not a bare `Error`, so
  the test can prove the rollback ran because of the intended fault and not some
  unrelated failure that would also abort.
- Uses the named `getDb()` handle for the collection, not `client.db()`: the
  connection URI declares no default database, so `client.db()` would point at the
  `test` database, a different one from the harness's `mongodb1`, and the transfer
  would read an empty collection.

## Verified behaviour

Confirmed by the judge (PASS). `npm run ex:transactions` runs and exits zero (twice,
idempotent), printing the commit moving `acct-alice` 100 to 70 and `acct-bob` 40 to
70, the forced abort leaving both at 70, and the total at 140 throughout. The
integration tier asserts the committed balances and the conserved total, that a
forced mid-transaction failure rolls back the debit (asserting `ForcedAbort`
specifically and the untouched 100 / 40 balances), and that an overdrawing transfer
aborts with both balances untouched. The unit tier asserts the seed sums to TOTAL,
has two distinct accounts and starts the source above the tested transfers.

Three hollow checks all returned ASSERTS, so the tests prove behaviour rather than
passing vacuously:

- Credit application (integration): changing the credit `$inc` from `amount` to `0`
  left the target unchanged and the commit test caught it.
- Forced abort (integration): replacing the `throw new ForcedAbort()` with a
  `return` let the transfer commit and the abort test caught the changed balances.
- Seed shape (unit): shrinking the source starting balance was caught by
  `transactions.test.ts`.

## Gotchas

- Multi-document transactions require a replica set; the harness already runs one.
  They fail on a standalone mongod.
- Both the debit and the credit must pass `{ session }`. An operation without it
  runs outside the transaction and is not rolled back on abort, silently breaking
  atomicity.
- `client.db()` with no name points at the URI default (`test`), not the harness
  `mongodb1`. Use the named `getDb()` handle for the collection while opening the
  session on the same shared client.
- The transfer needs live Mongo, so the behavioural tests are integration tier
  only, with the seed-shape assertions in the unit tier.

## Dependencies

Builds on deliverable 3 (the connection helper and seed):
[3-connection-helper-and-seed](./3-connection-helper-and-seed.md). It uses the
shared client from [`src/db.ts`](../../src/db.ts) and the centralised collection
names and shapes from [`src/collections.ts`](../../src/collections.ts), and seeds
its own `accounts` scratch collection rather than relying on the faker seed.
