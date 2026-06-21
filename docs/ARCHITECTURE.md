# Architecture

How the Mongo playground is wired together. Per-deliverable detail lives under
[docs/modules](./modules); this file is the cross-cutting view.

## Dependency graph

The deliverable build order, derived from the `depends_on` field of each
deliverable in [docs/deliverables.md](./deliverables.md). Roots with no
dependencies are one colour, dependents another.

<!-- depgraph -->

```mermaid
graph TD
  classDef root fill:#cde4ff,stroke:#3b6fb0,color:#0b2545
  classDef dep fill:#ffe8cc,stroke:#c77f2a,color:#4a2c08

  1[1 Scaffold and tooling]
  2[2 Docker and replica set]
  3[3 Connection helper and seed]
  4[4 CRUD]
  5[5 Indexes]
  6[6 Aggregation pipeline]
  7[7 Schema validation]
  8[8 Text search]
  9[9 Geospatial]
  10[10 Transactions]
  11[11 Change streams]
  12[12 Time series]
  13[13 GridFS]
  14[14 Oplog peek]
  15[15 RBAC]
  16[16 SSE server]
  17[17 React dashboard]
  18[18 README finalisation]

  1 --> 2
  2 --> 3
  3 --> 4
  3 --> 5
  3 --> 6
  3 --> 7
  3 --> 8
  3 --> 9
  3 --> 10
  3 --> 11
  3 --> 12
  3 --> 13
  3 --> 14
  3 --> 15
  11 --> 16
  16 --> 17
  4 --> 18
  5 --> 18
  6 --> 18
  7 --> 18
  8 --> 18
  9 --> 18
  10 --> 18
  12 --> 18
  13 --> 18
  14 --> 18
  15 --> 18
  17 --> 18

  class 1 root
  class 2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18 dep
```

<!-- /depgraph -->

## Connection and seed layer

The single point of database access and the deterministic data the rest of the
harness builds on. See the module doc:
[3-connection-helper-and-seed](./modules/3-connection-helper-and-seed.md).

### Single shared MongoClient

[`src/db.ts`](../src/db.ts) owns one `MongoClient` per process, cached in a
module-level variable and handed out by `getClient()`. Construction is lazy, the
driver touches no network until `connect()`, so the getter is unit testable for
reuse with the database down. `getDb()` connects that one client and returns a
typed `Db` on `DB_NAME` (`mongodb1`); `closeClient()` closes and clears it so a
later `getClient()` rebuilds and the process can exit. Every module imports these,
none constructs its own client or connects per query. The URI carries
`directConnection=true` because a single node replica set advertises its internal
container hostname which the host cannot resolve.

### Centralised collection names and shared interfaces

[`src/collections.ts`](../src/collections.ts) is the only place collection names
and document shapes are declared. `COLLECTIONS` holds the name constants and the
`GeoPoint`, `User`, `Place` and `Post` interfaces define the document shapes,
passed as driver generics (`db.collection<User>(COLLECTIONS.users)`). Modules
import these rather than hardcoding name strings or redefining shapes, so a rename
or a shape change is one edit.

### Faker seed

[`src/seed.ts`](../src/seed.ts) generates seed data with faker rather than
shipping a static dump. `seedAll()` sets a fixed faker seed (1337) so counts and
any sampled document are stable for tests, then drops each collection before
inserting so re-running is idempotent and leaves exactly `SEED_COUNTS`
(users 25, places 15, posts 40). It returns the counts and leaves the client open,
the caller owns the lifecycle. Run it with `npm run seed` or `make seed`.

## Example modules

Each feature lives in one file under [`src/examples`](../src/examples), runnable on
its own via an `ex:<feature>` npm script and printing its results. Modules import
the shared client from [`src/db.ts`](../src/db.ts) and collection names from
[`src/collections.ts`](../src/collections.ts), they never connect per query or
hardcode a name. A module that mutates data works in its own scratch collection so
it never corrupts the seed the other modules read.

### CRUD

The core create, read, update and delete operations. See the module doc:
[4-crud](./modules/4-crud.md). [`src/examples/crud.ts`](../src/examples/crud.ts)
covers insertOne, insertMany, find with a filter and a projection, updateOne,
updateMany, upsert, deleteOne and deleteMany against a dedicated `widgets`
collection, run with `npm run ex:crud`. Because it deletes and mutates, it uses
its own scratch collection rather than the seeded `users`, `places` and `posts`,
its tests drop that collection before each case so they are order independent.

### Indexes

Compound, partial and TTL indexes, with explain proving the planner uses them. See
the module doc: [5-indexes](./modules/5-indexes.md).
[`src/examples/indexes.ts`](../src/examples/indexes.ts) builds the three indexes on
a dedicated `metrics` scratch collection and exposes helpers that explain a query
and walk the winning plan, run with `npm run ex:indexes`. The real gate is the
explain stage: a recursive walk of the winning plan asserts an IXSCAN is present
and a COLLSCAN is absent, so the test fails if an index is dropped or ignored. The
partial index is proven by hinting it and showing the documents outside its filter
are absent, and the TTL index is asserted by its recorded `expireAfterSeconds`
rather than by waiting for the background monitor to delete.

<!-- 6 -->

## Aggregation pipeline

The core aggregation stages over two related collections. See the module doc:
[6-aggregation](./modules/6-aggregation.md).
[`src/examples/aggregation.ts`](../src/examples/aggregation.ts) exercises $match,
$group, $sort, $project, $lookup, $unwind, $facet and $bucket against dedicated
`orders` and `customers` scratch collections, run with `npm run ex:aggregation`.
The collections carry hand-authored deterministic data rather than the faker seed,
because the acceptance criteria demand concrete numbers a wrong pipeline would not
produce, so every total, count and bucket is computable by hand. $lookup needs a
second related collection, hence two: orders join to customers by `customerId`, and
the joined region is projected flat to confirm the related fields arrived.

The seed is shaped so the assertions gate the pipeline, not just the result length.
The cancelled order carries the largest amount and one customer owns no orders, so a
broken pre-group $match or an over-eager $group changes the asserted numbers. Every
helper needs live Mongo, so the module is integration tier only.

<!-- /6 -->
