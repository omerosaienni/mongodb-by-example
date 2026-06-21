# Architecture

How the Mongo playground is wired together. Per-deliverable detail lives under
[docs/modules](./modules); this file is the cross-cutting view.

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
