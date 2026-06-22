import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type GeoPoint, type Landmark } from '../collections.js';

// Named so listIndexes and the tests can assert the 2dsphere index by name
// rather than reconstructing the auto-generated name from its key.
export const INDEX_NAMES = {
  location: 'location_2dsphere',
} as const;

// The query origin the demo and tests share: Trafalgar Square. Fixed so the
// nearest-first ordering of the landmarks below is unambiguous. coordinates are
// [longitude, latitude], longitude first.
export const ORIGIN: [number, number] = [-0.1281, 51.508];

// WGS84 equatorial radius in metres, for the haversine helper and for converting the
// $centerSphere radius, which Mongo expresses in radians, to a distance.
const EARTH_RADIUS_M = 6_378_137;

// A circular search area for the within query: centred on the origin with a
// radius wide enough to include the inner-city landmarks but tight enough to
// exclude Greenwich. Radius is in radians, as $centerSphere requires.
export const WITHIN_RADIUS_M = 5_000;
export const WITHIN_AREA: { centre: [number, number]; radiusRadians: number } = {
  centre: ORIGIN,
  radiusRadians: WITHIN_RADIUS_M / EARTH_RADIUS_M,
};

// A row shaped for printing and asserting: the landmark name alongside the
// distance from the origin in metres, so callers compare ordering without
// carrying the whole document.
export interface RankedLandmark {
  name: string;
  distanceM: number;
}

async function landmarks(): Promise<Collection<Landmark>> {
  const db = await getDb();
  return db.collection<Landmark>(COLLECTIONS.landmarks);
}

// A $near or $geoNear query requires the 2dsphere index to exist or it errors,
// so resetAndSeed builds this before any query runs. Naming it lets the test
// assert it exists by name.
export async function createGeoIndex(): Promise<void> {
  const col = await landmarks();
  await col.createIndex({ location: '2dsphere' }, { name: INDEX_NAMES.location });
}

// Deterministic dataset the demo and tests share. Real London landmarks at known
// coordinates and increasing distances from the origin, so nearest-first ordering
// is fixed. longitude is the small negative value and latitude the ~51.5 value, so
// a [lon,lat] swap would move every point and change the ordering, which the test
// would catch. Greenwich sits well outside WITHIN_RADIUS_M so the within query has
// a point it must exclude.
export function sampleLandmarks(): Landmark[] {
  const point = (lon: number, lat: number): GeoPoint => ({
    type: 'Point',
    coordinates: [lon, lat],
  });
  return [
    { name: 'Covent Garden', location: point(-0.124, 51.5117) },
    { name: 'British Museum', location: point(-0.1269, 51.5194) },
    { name: "St Paul's Cathedral", location: point(-0.0986, 51.5138) },
    { name: 'Tower of London', location: point(-0.0759, 51.5081) },
    { name: 'Greenwich Observatory', location: point(0.0, 51.4769) },
  ];
}

// Great-circle distance in metres between two [lon,lat] points. Pure so the unit
// tier can derive expected distances and the within split without a database, and
// so it matches Mongo's spherical distance closely enough to order the same way.
export function haversineMetres(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// True if the distances are in non-decreasing order. Pure so the unit tier can
// assert the nearest-first ordering predicate without a database.
export function isAscending(distances: number[]): boolean {
  return distances.every((d, i) => i === 0 || distances[i - 1] <= d);
}

// Run a $geoNear aggregation from the origin, returning landmarks nearest first
// with the computed spherical distance. $geoNear must be the first pipeline stage
// and uses the 2dsphere index, so it returns documents already ordered by
// distance. The distanceField surfaces the metres the test asserts increase.
export async function near(origin: [number, number]): Promise<RankedLandmark[]> {
  const col = await landmarks();
  const docs = await col
    .aggregate<{ name: string; distanceM: number }>([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: origin },
          distanceField: 'distanceM',
          spherical: true,
        },
      },
      { $project: { _id: 0, name: 1, distanceM: 1 } },
    ])
    .toArray();
  return docs.map((d) => ({ name: d.name, distanceM: d.distanceM }));
}

// Run a $geoWithin query over a $centerSphere circle, returning only landmarks
// inside it. $geoWithin does not sort or require an index, but the 2dsphere index
// is present and is used. The radius is in radians, as $centerSphere expects.
export async function within(area: {
  centre: [number, number];
  radiusRadians: number;
}): Promise<string[]> {
  const col = await landmarks();
  const docs = await col
    .find(
      { location: { $geoWithin: { $centerSphere: [area.centre, area.radiusRadians] } } },
      { projection: { _id: 0, name: 1 } },
    )
    .toArray();
  return docs.map((d) => d.name);
}

// Drop and rebuild the scratch collection with the fixed dataset, then build the
// 2dsphere index. Exported so the test can establish the same known state. The
// index is built last but before any query, because $geoNear errors without it.
export async function resetAndSeed(): Promise<void> {
  const col = await landmarks();
  await col.drop().catch(() => false);
  await col.insertMany(sampleLandmarks());
  await createGeoIndex();
}

async function demo(): Promise<void> {
  await resetAndSeed();

  const col = await landmarks();
  const built = await col.listIndexes().toArray();
  console.log(
    'indexes:',
    built.map((i) => i.name),
  );

  // Ordered nearest first from the origin: Covent Garden, then outward to
  // Greenwich, with each distance larger than the last.
  const ranked = await near(ORIGIN);
  console.log('landmarks ordered nearest first from the origin:', ranked);
  console.log('ordered by ascending distance:', isAscending(ranked.map((r) => r.distanceM)));

  // Only the landmarks within the circle, excluding Greenwich which sits beyond
  // the radius.
  const inside = await within(WITHIN_AREA);
  console.log(`within ${WITHIN_RADIUS_M}m of the origin:`, inside);
}

// Run directly via `npm run ex:geo`. The import.meta.url guard keeps the exported
// helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
