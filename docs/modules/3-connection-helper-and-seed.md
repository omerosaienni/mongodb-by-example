# Deliverable 3 — Connection helper and seed

## Purpose

Shared database access and a deterministic seed for the harness.
[`src/db.ts`](../../src/db.ts) holds the single MongoClient every module reuses,
[`src/collections.ts`](../../src/collections.ts) is the one place collection names
and document shapes are defined, and [`src/seed.ts`](../../src/seed.ts) populates
the known collections with faker data including GeoJSON coordinates and free text
so the example modules and tests have stable input.

## Public interface

### [`src/db.ts`](../../src/db.ts)

- `DB_NAME: string` — the database name (`mongodb1`) the whole harness uses.
- `getClient(): MongoClient` — returns the one shared MongoClient, building it
  lazily on first call and reusing it thereafter. No network until you connect.
- `getDb(): Promise<Db>` — connects the shared client and returns a typed `Db` on
  `DB_NAME`. `connect()` is idempotent so callers need not coordinate.
- `closeClient(): Promise<void>` — closes the shared client and clears it so a
  later `getClient()` rebuilds. Scripts and tests must call this to let the
  process exit.

### [`src/collections.ts`](../../src/collections.ts)

- `COLLECTIONS: { users: 'users'; places: 'places'; posts: 'posts' }` — collection
  name constants, declared `as const`.
- `interface GeoPoint { type: 'Point'; coordinates: [number, number] }` — a
  GeoJSON Point, coordinates ordered [longitude, latitude].
- `interface User { name: string; email: string; age: number; bio: string; location: GeoPoint }`
  — `bio` is the free-text field, `location` the geospatial point.
- `interface Place { name: string; category: string; location: GeoPoint }` — the
  target of geospatial queries.
- `interface Post { title: string; body: string; tags: string[]; authorEmail: string }`
  — free text for text-search examples; `authorEmail` links loosely to a user.

### [`src/seed.ts`](../../src/seed.ts)

- `SEED_COUNTS: { users: 25; places: 15; posts: 40 }` — exact counts the seed
  inserts; the single source of truth tests assert against.
- `seedAll(): Promise<typeof SEED_COUNTS>` — seeds faker deterministically, drops
  then inserts each collection, returns the counts. Does not close the client; the
  caller owns the lifecycle.

## Usage

Run the seed via npm or Make, both wrap `tsx src/seed.ts`:

```
npm run seed
# or
make seed
```

It prints the per-collection counts and exits zero:

```
seeded collections:
  users: 25
  places: 15
  posts: 40
```

Example modules import the shared client and collection names, they never connect
or hardcode strings:

```ts
import { getDb, closeClient } from './db.js';
import { COLLECTIONS, type User } from './collections.js';

const db = await getDb();
const users = db.collection<User>(COLLECTIONS.users);
// ... work ...
await closeClient();
```

## Gotchas

- `directConnection=true` is mandatory in the URI: a single node replica set
  advertises its internal container hostname which the host cannot resolve, so the
  driver must be told not to follow that advertisement.
- One shared client only: never `new MongoClient` elsewhere, import from
  [`src/db.ts`](../../src/db.ts). Connecting per query or per function is a bug.
- Deterministic faker seed (1337) keeps counts and sampled documents stable.
  Changing the seed or the generators will shift the sampled-document test.
- The seed drops collections before inserting, so it is idempotent but
  destructive: running it wipes existing data in `users`, `places` and `posts`,
  leaving exactly the claimed counts rather than accumulating duplicates.
- Per-collection counts are fixed: users 25, places 15, posts 40.
- `coordinates` order is [longitude, latitude], matching GeoJSON and the 2dsphere
  index.

## Verification

Judged PASS on branch `3-connection-helper-and-seed` with the Mongo endpoint up.
Summary of the judge result, cited not re-run:

- All four acceptance criteria met: one cached MongoClient reused, `npm run seed`
  populates the seeded collections and exits zero, a test asserts collection counts
  match the seed claim, and a test asserts a sampled user has the expected fields
  and types including a GeoJSON point and a free-text field.
- Both tiers green: unit tier 3 tests pass with the database down, integration tier
  3 tests pass against the endpoint. `tsc --noEmit` clean.
- Hollow-test proven by three negative runs (temporary, reverted): `users.slice(1)`
  failed the count test (expected 24 to be 25), `type: 'point'` failed the shape
  test, and returning a fresh client failed the reuse test. The assertions are
  wired to real state, not hollow.
