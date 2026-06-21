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
typed `Db` on `DB_NAME` (`playground`); `closeClient()` closes and clears it so a
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
