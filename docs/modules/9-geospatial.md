# Deliverable 9 — Geospatial

## Purpose

A MongoDB 2dsphere index and the two core geospatial queries over a fixed set of
landmarks: a near query that returns points ordered by distance from an origin and
a within query that returns the points inside a given area.
[`src/examples/geo.ts`](../../src/examples/geo.ts) builds a named 2dsphere index,
seeds five fixed London landmarks at strictly increasing distances from a fixed
origin, runs a `$geoNear` aggregation for nearest-first ordering with the computed
distance, and a `$geoWithin` + `$centerSphere` query for the inside or outside
split. Run it with `npm run ex:geo`; it prints the built indexes, the landmarks
ordered nearest first with whether the distances ascend, and the within result,
then exits zero.

## Public interface

### [`src/examples/geo.ts`](../../src/examples/geo.ts)

All helpers operate on the `landmarks` scratch collection, typed as
`Collection<Landmark>`.

- `INDEX_NAMES` — the explicit 2dsphere index name (`location_2dsphere`) so callers
  and tests assert by a stable name rather than reconstructing the auto-generated
  name from its key.
- `ORIGIN: [number, number]` — the shared query origin `[lon, lat]`, Trafalgar
  Square.
- `WITHIN_RADIUS_M` and `WITHIN_AREA` — a `$centerSphere` circle centred on the
  origin, with the radius held in radians for Mongo.
- `RankedLandmark` — a row shaped for printing and asserting: `name` plus the
  `distanceM` from the origin.
- `createGeoIndex()` — builds the named 2dsphere index over `location`.
- `sampleLandmarks(): Landmark[]` — the deterministic dataset the demo and tests
  share.
- `haversineMetres(a, b): number` — pure great-circle distance in metres.
- `isAscending(distances): boolean` — pure predicate, true if the distances are
  non-decreasing.
- `near(origin): Promise<RankedLandmark[]>` — runs a `$geoNear` aggregation,
  returning landmarks nearest first with the computed spherical distance.
- `within(area): Promise<string[]>` — runs a `$geoWithin` + `$centerSphere` query,
  returning the names inside the circle.
- `resetAndSeed()` — drops, inserts the fixed docs and builds the index, so the
  test can establish the same known state.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.landmarks` — the scratch collection name the geo module owns.
- `interface Landmark` — the document shape (`name` plus a reused `GeoPoint`
  `location`), passed as the driver generic
  `db.collection<Landmark>(COLLECTIONS.landmarks)`.

### [`package.json`](../../package.json)

- `ex:geo` — runs the module via `tsx src/examples/geo.ts`.

## Key decisions

- Uses a `$geoNear` aggregation rather than a `find()` + `$near`, because its
  `distanceField` surfaces the computed spherical distance, so callers and tests
  assert ordering by an increasing distance value, not just document order.
- Uses a dedicated `landmarks` scratch collection with hand-written coordinates
  rather than the faker-seeded `places`, because random points cannot give a
  provable nearest-first order or a known inside or outside split. The corpus is
  fixed: five real London landmarks at strictly increasing distances from the
  origin, with one (Greenwich) deliberately outside the radius.
- The `$centerSphere` radius is pre-converted from metres to radians in
  `WITHIN_AREA`, since Mongo expresses that radius in radians.
- `haversineMetres` and `isAscending` are extracted as pure helpers so the unit
  tier can prove the integration assertions are non-vacuous (distinct strictly
  increasing distances and a non-empty inside and outside split) with no database.

## Verified behaviour

Confirmed by the judge (PASS). `npm run ex:geo` runs and exits zero, printing the
2dsphere index, the five landmarks ordered nearest first (Covent Garden 500m
through Greenwich 9530m) with ascending distance true, and the within result
excluding Greenwich. The integration tier asserts the named 2dsphere index exists
keyed `{ location: '2dsphere' }`, the exact nearest-first name sequence with
strictly increasing distances, and the within inclusion of Covent Garden plus
exclusion of Greenwich. The unit tier asserts the ordering predicate, the
haversine swap detection, the strictly increasing dataset distances and the
non-empty inside or outside split.

Three hollow checks all returned ASSERTS, so the tests prove behaviour rather than
passing vacuously:

- Near ordering (integration): moving `ORIGIN` to Greenwich reordered the sequence
  and the test caught it.
- Within inclusion (integration): shrinking `WITHIN_RADIUS_M` from 5000 to 100
  excluded Covent Garden and the test caught it.
- Ordering predicate (unit): inverting the `isAscending` comparison was caught by
  `geo.test.ts`.

## Gotchas

- Coordinates are `[longitude, latitude]`, longitude first. A swap moves every
  point and changes the results; the chosen longitude (~-0.1) and latitude (~51.5)
  differ enough that a swap is caught by the tests.
- `$geoNear` (and `$near`) require the 2dsphere index to exist or the query errors,
  so `resetAndSeed` builds the index before any query runs. `$geoNear` must also be
  the first aggregation stage.
- `$geoWithin` does not sort and does not require an index, so the within result is
  unordered; assert membership, not order.
- The near and within queries need live Mongo, so the behavioural tests are
  integration tier only, with the pure `haversineMetres` and `isAscending`
  predicates covered in the unit tier.

## Dependencies

Builds on deliverable 3 (the connection helper and seed):
[3-connection-helper-and-seed](./3-connection-helper-and-seed.md). It uses the
shared client from [`src/db.ts`](../../src/db.ts) and the centralised collection
names and shapes from [`src/collections.ts`](../../src/collections.ts), including
the reused `GeoPoint` interface, and seeds its own scratch collection rather than
relying on the faker seed.
