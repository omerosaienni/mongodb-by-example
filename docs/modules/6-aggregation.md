# Deliverable 6 — Aggregation pipeline

## Purpose

The core aggregation stages demonstrated through the native TypeScript driver over
two related scratch collections, with every result computable by hand from a fixed
seed. [`src/examples/aggregation.ts`](../../src/examples/aggregation.ts) exercises
$match, $group, $sort, $project, $lookup, $unwind, $facet and $bucket. Run it with
`npm run ex:aggregation`; it seeds the `orders` and `customers` collections then
prints the result of each pipeline, and exits zero.

## Public interface

### [`src/examples/aggregation.ts`](../../src/examples/aggregation.ts)

Helpers operate on the `orders` and `customers` scratch collections, typed as
`Collection<Order>` and `Collection<Customer>`. Each pipeline $projects its group
key into a named field so callers and tests assert on a typed shape, not a raw
`_id`.

- `totalsByStatus()` — $groups every order by status, summing amount and counting,
  sorted by total descending. Returns `StatusTotal[]`.
- `paidTotalsByCustomer()` — $matches paid orders, then $groups by customer.
  Returns `CustomerTotal[]`.
- `tagOccurrences()` — $unwinds the tags array then $groups to count each tag.
  Returns `TagCount[]`.
- `ordersByAmountBucket()` — $buckets orders by amount over the boundaries
  `[0, 100, 500, 1000]`. Returns `AmountBucket[]`.
- `orderWithCustomer(orderId)` — $lookups and $unwinds the joined customer, then
  $projects its name and region flat. Returns `OrderWithCustomer | undefined`.
- `statusAndBucketFacet()` — runs the status totals and the amount buckets as two
  $facets in one pass. Returns a driver `Document` with `byStatus` and
  `amountBuckets` keys.
- `sampleOrders()` / `sampleCustomers()` — the deterministic hand-authored seed
  arrays, shared between the demo and the tests.
- `resetAndSeed()` — drops and repopulates both scratch collections.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.orders: 'orders'` and `COLLECTIONS.customers: 'customers'` — the two
  scratch collection names the aggregation module owns. $lookup needs a second
  related collection, hence two.
- `interface Order` — the order document shape (status, amount, tags, customerId),
  passed as `db.collection<Order>(COLLECTIONS.orders)`. `customerId` is the join key
  into customers.
- `interface Customer` — the customer document shape (name, region), passed as
  `db.collection<Customer>(COLLECTIONS.customers)`. `region` gives a second field to
  confirm the joined document carries the expected related data.

## Usage

Run the example via npm, which wraps `tsx src/examples/aggregation.ts`:

```
npm run ex:aggregation
```

It seeds the two scratch collections then prints the totals by status, the paid
totals by customer, the tag occurrences, the amount buckets, order O1 joined to its
customer, and the facet output. The exported helpers are importable from tests
without re-running the script, the `import.meta.url` main-guard runs the demo only
when the module is the process entry point and calls `closeClient()` in finally.

## Gotchas

- **Dedicated scratch collections, not the seed.** The module drops and rebuilds
  `orders` and `customers`, so it stays independent of the seeded `users`, `places`
  and `posts` and of the other modules' scratch spaces. Do not point it at any
  collection that holds data you need. The names live in `COLLECTIONS`, they are
  never hardcoded.
- **Hand-authored deterministic data, no faker.** The acceptance criteria demand
  concrete numbers, but faker's exact output cannot be hand-computed, so
  `sampleOrders`/`sampleCustomers` are fixed arrays with no `now()` and no
  randomness. Every total, count and bucket is computable by hand, so each
  assertion is stable across runs.
- **Negative cases gate the assertions.** The cancelled order carries the largest
  amount (999) and customer C3 owns no orders, so a broken pre-group $match or an
  over-eager $group changes the asserted numbers rather than merely the result
  length. A wrong pipeline fails on a concrete value, not on a count.
- **Integration tier only.** Every helper needs live Mongo, so the tests live in
  [`src/examples/aggregation.integration.test.ts`](../../src/examples/aggregation.integration.test.ts).
  There is no dependency-free behaviour worth a unit test, so no unit file exists,
  matching the CRUD and indexes modules.

## Verification

Judged PASS on branch `6-aggregation-pipeline` with the Mongo endpoint up. Summary
of the judge result, cited not re-run:

- All four acceptance criteria met: `npm run ex:aggregation` runs and exits zero;
  the $group tests assert exact per-status and per-customer totals and counts from
  the deterministic seed (cancelled 999/1, paid 350/3, pending 100/2; paid by
  customer C1 150/2, C2 200/1 with C3 absent); the $lookup test asserts the joined
  documents carry the expected related fields (O1 to Ada/north, O3 to Bo/south);
  the $facet test asserts each facet returns its expected shape and exact key set.
- Both tiers green: unit tier 3 tests pass with no aggregation test misclassified
  into it, integration tier 24 tests pass across deliverables 1 to 6, of which 7
  are the new aggregation tests.
- Hollow-test proven by a negative run (temporary, reverted): swapping the
  pre-group $match in `paidTotalsByCustomer` from `{ status: 'paid' }` to
  `{ status: 'pending' }` failed the paid-only-match test on a concrete value
  (received `[{C2,100,2}]` instead of `[{C1,150,2},{C2,200,1}]`), not on a length
  check. The line was restored and the tree reverted clean.
- `tsc --noEmit` clean and `eslint src` clean, both exit zero.
